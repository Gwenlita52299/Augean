import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { changedFiles } from './changed.js'
import { checkDocs } from './check.js'
import { CORE_VERSION, satisfies } from './version.js'
import { docsDir, loadConfig } from './config.js'
import { checkEvidence } from './evidence.js'
import { applyExpiry, planExpiry, tombstonesPath } from './expire.js'
import { gitLambda, readState, resolveMode, retentionDays, writeState } from './retention.js'
import { scanDocs } from './scan.js'

export { CORE_VERSION, SCHEMA_VERSION } from './version.js'

const DAY_MS = 86400000

export function context(root, { now = Date.now() } = {}) {
  const { config, path } = loadConfig(root)
  const scan = scanDocs(root, config)
  const retention = config.retention
  const windowDays = retention.dynamic.lambda_window_weeks * 7
  const enabledAt = retention.dynamic.enabled_at
  const windowStart = now - windowDays * DAY_MS
  const since = enabledAt ? Math.max(Date.parse(enabledAt), windowStart) : windowStart
  const measured = gitLambda(root, new Date(since).toISOString(), retention.dynamic.lambda_window_weeks)
  const modeInfo = resolveMode(config, now, measured.samples)
  return { root, config, configPath: path, scan, dir: docsDir(root, config), measured, modeInfo, now }
}

/**
 * @param {object} [options]
 * @param {boolean} [options.changedOnly] report only violations in files git sees as changed
 * @param {string}  [options.since] with changedOnly: compare <since>...HEAD instead of the staged set
 */
export function check(root, { now, changedOnly = false, since = null } = {}) {
  const ctx = context(root, { now })
  // The scan stays full even in changed-only mode: id uniqueness and related ids
  // are only decidable against the whole set. Only the report is narrowed.
  const result = checkDocs(ctx.scan, ctx.config)
  let { violations } = result
  let changed = null
  if (changedOnly) {
    const files = changedFiles(root, { since })
    changed = files.size
    violations = violations.filter((item) => files.has(resolve(ctx.dir, item.file)))
  }

  const requires = ctx.config.requires
  if (requires) {
    const verdict = satisfies(CORE_VERSION, requires)
    if (!verdict.ok) {
      const file = ctx.configPath ? relative(ctx.dir, ctx.configPath).split(sep).join('/') : 'pmf.config.json'
      violations = [{ level: 'error', code: 'CORE_VERSION', file, message: verdict.reason }, ...violations]
    }
  }

  const errors = violations.filter((item) => item.level === 'error')
  const warnings = violations.filter((item) => item.level === 'warn')
  return {
    violations,
    errors,
    warnings,
    ok: errors.length === 0,
    docs: ctx.scan.docs.length,
    docsDir: ctx.dir,
    docsPresent: existsSync(ctx.dir),
    configPath: ctx.configPath,
    coreVersion: CORE_VERSION,
    changed,
  }
}

export function evidence(root, { spec, now } = {}) {
  const ctx = context(root, { now })
  const specs = ctx.scan.docs.filter((doc) => doc.kind === 'spec' && (!spec || doc.id === spec))
  return specs.map((doc) => checkEvidence(doc, root))
}

export function retention(root, { now = Date.now() } = {}) {
  const ctx = context(root, { now })
  const state = readState(ctx.dir)
  const plan = planExpiry(ctx.scan, ctx.config, state, { now, mode: ctx.modeInfo.mode, lambda: ctx.measured.lambda })
  return {
    mode: ctx.modeInfo.mode,
    modeReason: ctx.modeInfo.reason,
    enabledAt: ctx.config.retention.dynamic.enabled_at,
    lambda: ctx.measured.lambda,
    samples: ctx.measured.samples,
    gitError: ctx.measured.error,
    waiting: plan.waiting,
    due: plan.due,
    blocked: plan.blocked,
  }
}

export function expire(root, { apply = false, now = Date.now() } = {}) {
  const ctx = context(root, { now })
  const state = readState(ctx.dir)
  const options = { now, mode: ctx.modeInfo.mode, lambda: ctx.measured.lambda }
  if (!apply) return { applied: false, plan: planExpiry(ctx.scan, ctx.config, state, options) }
  const result = applyExpiry(ctx.scan, ctx.config, state, options)
  writeState(ctx.dir, result.state)
  return { applied: true, ...result }
}

/** Regenerate machine and human views. Both are derived; neither is hand-edited. */
export function buildIndex(root, { now = Date.now() } = {}) {
  const ctx = context(root, { now })
  const state = readState(ctx.dir)
  const docs = ctx.scan.docs.map((doc) => ({
    id: doc.id,
    kind: doc.kind,
    status: doc.status,
    owner: doc.owner,
    path: doc.rel,
    created: doc.created,
    updated: doc.updated,
    related: doc.related,
    links: doc.links,
  }))

  const graph = {
    generated: new Date(now).toISOString(),
    docsRoot: ctx.config.docsRoot,
    mode: ctx.modeInfo.mode,
    docs,
    retired: state.retired,
  }
  writeFileSync(join(ctx.dir, '.doc-index.json'), `${JSON.stringify(graph, null, 2)}\n`)

  const byStatus = new Map()
  for (const doc of docs) {
    const key = doc.status ?? 'unknown'
    byStatus.set(key, [...(byStatus.get(key) ?? []), doc])
  }
  const lines = ['<!-- generated: do not edit -->', '', '# Doc Index', '']
  for (const status of ['active', 'draft', 'retired', 'unknown']) {
    const bucket = byStatus.get(status)
    if (!bucket?.length) continue
    lines.push(`## ${status} (${bucket.length})`, '')
    lines.push('| id | kind | owner | path |', '| --- | --- | --- | --- |')
    for (const doc of bucket.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
      lines.push(`| ${doc.id ?? '—'} | ${doc.kind ?? '—'} | ${doc.owner ?? '—'} | ${doc.path} |`)
    }
    lines.push('')
  }
  writeFileSync(join(ctx.dir, 'INDEX.md'), `${lines.join('\n')}\n`)

  return { indexed: docs.length, retired: Object.keys(state.retired).length, tombstones: tombstonesPath(ctx.dir) }
}

export function enableDynamic(root, { now = Date.now() } = {}) {
  const { config, path } = loadConfig(root)
  const current = config.retention.dynamic.enabled_at
  if (config.retention.mode === 'dynamic' && current) {
    return { changed: false, reason: 'already enabled', enabledAt: current }
  }
  const target = path ?? join(root, 'pmf.config.json')
  // Patch the raw file, not the merged view: persisting defaults would freeze them
  // and silently drop keys the user set (docsRoot, exclude, ...).
  const raw = path ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const enabledAt = new Date(now).toISOString()
  raw.retention = {
    ...(raw.retention ?? {}),
    mode: 'dynamic',
    dynamic: { ...(raw.retention?.dynamic ?? {}), enabled_at: enabledAt },
  }
  writeFileSync(target, `${JSON.stringify(raw, null, 2)}\n`)
  return { changed: true, configPath: target, enabledAt }
}

export function retentionDaysFor(root, { kind, mode = 'fixed', lambda = null, cost = null, regen = null } = {}) {
  const { config } = loadConfig(root)
  return retentionDays({ kind, cost, regen }, config, mode, lambda)
}
