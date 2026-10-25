import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DAY_MS = 86400000

/** Plugin-owned state. Kept apart from generated views so regeneration never rewrites it. */
export function statePath(dir) {
  return join(dir, '.pmf-state.json')
}

export function readState(dir) {
  const path = statePath(dir)
  if (!existsSync(path)) return { retired: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    return { retired: raw.retired ?? {} }
  } catch {
    return { retired: {} }
  }
}

export function writeState(dir, state) {
  writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * λ = changed markdown docs per week, counted only from `sinceISO` onward.
 * Returns null when git cannot answer; callers must then stay on fixed values.
 */
export function gitLambda(root, sinceISO, weeks) {
  const args = ['log', '--diff-filter=AM', '--name-only', '--pretty=format:', `--since=${sinceISO}`, '--', '.']
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) return { lambda: null, samples: 0, error: (result.stderr ?? '').trim().split('\n')[0] || 'git unavailable' }
  const files = new Set(
    result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.md')),
  )
  const samples = files.size
  return { lambda: samples / Math.max(weeks, 1), samples, error: null }
}

/** fixed | dynamic | fixed (warmup) — never trusts a half-matured signal. */
export function resolveMode(config, now, samples) {
  const retention = config.retention
  if (retention.mode !== 'dynamic') return { mode: 'fixed', reason: 'switch is off' }
  const enabledAt = retention.dynamic.enabled_at
  if (!enabledAt) return { mode: 'fixed', reason: 'dynamic never enabled' }
  const enabledMs = Date.parse(enabledAt)
  if (Number.isNaN(enabledMs)) return { mode: 'fixed', reason: 'invalid enabled_at' }
  const elapsedDays = (now - enabledMs) / DAY_MS
  const warmupDays = retention.dynamic.warmup_weeks * 7
  if (elapsedDays < warmupDays) {
    return { mode: 'fixed', reason: `warmup ${elapsedDays.toFixed(1)}/${warmupDays}d`, enabledAt, elapsedDays }
  }
  if (samples < retention.dynamic.min_samples) {
    return { mode: 'fixed', reason: `samples ${samples}<${retention.dynamic.min_samples}`, enabledAt, elapsedDays }
  }
  return { mode: 'dynamic', reason: null, enabledAt, elapsedDays }
}

function defaultCost(doc) {
  if (doc.cost) return doc.cost
  if (doc.kind === 'explainer') return doc.regen ? 'cheap' : 'medium'
  if (doc.kind === 'note') return 'medium'
  return 'medium'
}

/**
 * Retention in days. A regenerable explainer is 0 in every mode: that rule is
 * grounded in reproducibility, not in statistics, so the switch must not change it.
 */
export function retentionDays(doc, config, mode, lambda) {
  if (doc.kind === 'explainer' && doc.regen) return 0

  const retention = config.retention
  if (mode !== 'dynamic') {
    return retention.fixed[doc.kind] ?? retention.fixed.note
  }

  const [minDays, maxDays] = retention.dynamic.clamp
  const rate = Math.max(lambda ?? 0, 0.25)
  const kindWeight = retention.mKind[doc.kind] ?? 1
  const costWeight = retention.wCost[defaultCost(doc)] ?? 1
  const raw = (retention.dynamic.n_target / rate) * kindWeight * costWeight
  return Math.round(Math.min(Math.max(raw, minDays), maxDays))
}

export function dueAt(doc, state, config) {
  const frozen = state.retired[doc.id]
  const days = frozen?.days
  if (typeof days !== 'number') return null
  const retiredAt = frozen.at ?? doc.retiredAt
  if (!retiredAt) return null
  const base = Date.parse(`${retiredAt}T00:00:00Z`)
  if (Number.isNaN(base)) return null
  return { days, retiredAt, due: new Date(base + days * DAY_MS) }
}
