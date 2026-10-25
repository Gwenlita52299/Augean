#!/usr/bin/env node
import { buildIndex, check, enableDynamic, evidence, expire, retention } from '../lib/api.js'
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

function print(value) {
  if (json) console.log(JSON.stringify(value, null, 2))
  else console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

switch (command) {
  case 'check': {
    const result = check(root)
    if (flag('--write')) buildIndex(root)
    if (!result.docsPresent) {
      print(`no docs directory at ${result.docsDir}\ncreate docs/ with a pmf.config.json, or pass --root to point at the project that holds one`)
      break
    }
    if (json) print({ ok: result.ok, errors: result.errors, warnings: result.warnings, docs: result.docs })
    else print(`${result.docs} docs, ${result.errors.length} errors, ${result.warnings.length} warnings\n${formatViolations(result)}`)
    if (!result.ok) process.exitCode = 1
    break
  }
  case 'index': {
    print(buildIndex(root))
    break
  }
  case 'retention': {
    print(retention(root))
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
      print(lines.join('\n'))
    } else {
      print(`deleted ${result.deleted.length}\n${result.deleted.map((item) => `- ${item.id} → ${item.successor}`).join('\n')}`)
    }
    break
  }
  case 'evidence': {
    const reports = evidence(root, { spec: option('--spec') })
    if (json) print(reports)
    else {
      print(reports.map((report) => {
        const head = `${report.id ?? report.rel}: ${report.summary.met} met / ${report.summary.open} open / ${report.summary.deleted} deleted`
        const blockers = report.blockers.map((ac) => `  - ${ac.id}: ${ac.reason}`)
        return [head, ...blockers].join('\n')
      }).join('\n\n') || 'no specs found')
    }
    if (reports.some((report) => !report.closeGate)) process.exitCode = 1
    break
  }
  case 'enable-dynamic': {
    const result = enableDynamic(root)
    print(result.changed ? `dynamic enabled at ${result.enabledAt} (${result.configPath})` : `not changed: ${result.reason} (${result.enabledAt})`)
    break
  }
  default:
    fail(`usage: pmf <check|index|retention|expire|evidence|enable-dynamic> [--root DIR] [--write] [--apply] [--json] [--spec ID]`)
}
