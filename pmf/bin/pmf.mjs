#!/usr/bin/env node
import { installHooks, uninstallHooks } from '../adapters/git-hooks.js'
import { buildIndex, check, CORE_VERSION, enableDynamic, evidence, expire, retention, SCHEMA_VERSION } from '../lib/api.js'
import { formatViolations } from '../lib/check.js'

const argv = process.argv.slice(2)
const command = argv[0] ?? 'help'
const flag = (name) => argv.includes(name)

function option(name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const root = option('--root') ?? process.cwd()
const json = flag('--json')

/**
 * Every --json payload is an object carrying schema_version, so any surface (MCP,
 * CI, a dashboard) can refuse a shape it does not understand instead of misreading it.
 */
function emit(value, text) {
  if (json) console.log(JSON.stringify({ schema_version: SCHEMA_VERSION, core_version: CORE_VERSION, command, ...value }, null, 2))
  else console.log(text ?? JSON.stringify(value, null, 2))
}

function fail(message) {
  if (json) console.log(JSON.stringify({ schema_version: SCHEMA_VERSION, core_version: CORE_VERSION, command, error: message }, null, 2))
  else console.error(message)
  process.exit(1)
}

function run() {
  switch (command) {
    case 'check': {
      const changedOnly = flag('--changed-only')
      const since = option('--since') ?? null
      if (since && !changedOnly) fail('--since only applies together with --changed-only')
      const result = check(root, { changedOnly, since })
      if (flag('--write')) buildIndex(root)
      if (!result.docsPresent) {
        emit(
          { ok: true, checked: false, reason: 'no docs directory', docsDir: result.docsDir },
          `no docs directory at ${result.docsDir}\ncreate docs/ with a pmf.config.json, or pass --root to point at the project that holds one`,
        )
        break
      }
      const scope = changedOnly ? ` (changed-only: ${result.changed} changed files${since ? ` since ${since}` : ', staged'})` : ''
      emit(
        { ok: result.ok, errors: result.errors, warnings: result.warnings, docs: result.docs, changedOnly, changed: result.changed },
        `${result.docs} docs, ${result.errors.length} errors, ${result.warnings.length} warnings${scope}\n${formatViolations(result)}`,
      )
      if (!result.ok) process.exitCode = 1
      break
    }
    case 'index': {
      emit(buildIndex(root))
      break
    }
    case 'retention': {
      emit(retention(root))
      break
    }
    case 'expire': {
      const apply = flag('--apply')
      const result = expire(root, { apply })
      if (!apply) {
        const plan = result.plan
        const lines = [
          `dry run — ${plan.due.length} due, ${plan.waiting.length} waiting, ${plan.blocked.length} blocked`,
          ...plan.due.map((item) => `DUE  ${item.id} (${item.kind}) r=${item.days}d due=${item.due} → ${item.rel}`),
          ...plan.waiting.map((item) => `WAIT ${item.id} due=${item.due} (${item.days}d ${item.mode})`),
          ...plan.blocked.map((item) => `BLOCK ${item.id ?? item.rel} — ${item.reason}`),
        ]
        emit(result, lines.join('\n'))
      } else {
        emit(result, `deleted ${result.deleted.length}\n${result.deleted.map((item) => `- ${item.id} → ${item.successor}`).join('\n')}`)
      }
      break
    }
    case 'evidence': {
      const reports = evidence(root, { spec: option('--spec') })
      const text = reports.map((report) => {
        const head = `${report.id ?? report.rel}: ${report.summary.met} met / ${report.summary.open} open / ${report.summary.deleted} deleted`
        const blockers = report.blockers.map((ac) => `  - ${ac.id}: ${ac.reason}`)
        return [head, ...blockers].join('\n')
      }).join('\n\n') || 'no specs found'
      emit({ reports }, text)
      if (reports.some((report) => !report.closeGate)) process.exitCode = 1
      break
    }
    case 'enable-dynamic': {
      const result = enableDynamic(root)
      emit(result, result.changed ? `dynamic enabled at ${result.enabledAt} (${result.configPath})` : `not changed: ${result.reason} (${result.enabledAt})`)
      break
    }
    case 'hooks': {
      const action = argv[1]
      if (action === 'install') {
        const result = installHooks(root, { force: flag('--force') })
        emit(result, [
          `hooks dir: ${result.hooksDir}`,
          ...result.installed.map((hook) => `installed ${hook}`),
          ...result.skipped.map((item) => `skipped   ${item.hook} — ${item.reason}`),
        ].join('\n'))
        if (result.skipped.length) process.exitCode = 1
      } else if (action === 'uninstall') {
        const result = uninstallHooks(root)
        emit(result, result.removed.length ? result.removed.map((hook) => `removed ${hook}`).join('\n') : 'no pmf hooks installed')
      } else {
        fail('usage: pmf hooks <install|uninstall> [--root DIR] [--force]')
      }
      break
    }
    case 'version': {
      emit({ schema: SCHEMA_VERSION, core: CORE_VERSION }, `pmf ${CORE_VERSION} (schema ${SCHEMA_VERSION})`)
      break
    }
    default:
      fail('usage: pmf <check|index|retention|expire|evidence|enable-dynamic|hooks|version> [--root DIR] [--write] [--apply] [--json] [--spec ID] [--changed-only [--since REF]]')
  }
}

try {
  run()
} catch (error) {
  fail(`pmf ${command}: ${error.message}`)
}
