import { buildIndex, check, enableDynamic, evidence, expire, retention } from './lib/api.js'
import { loadSkills } from './skills.js'
import { formatViolations } from './lib/check.js'

export const inject = ['tools']

const output = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
}

const ROOT_PARAM = {
  type: 'string',
  description: 'Absolute project root to inspect. Omit to use the Host process working directory.',
}

function rootOf(args) {
  return args?.root || process.cwd()
}

/**
 * Zero-config default: the session's own project directory. Args win, then the
 * configured root, then the Session working directory, then the process cwd.
 */
async function sessionRoot(ctx, exec) {
  const working = ctx.get('workingDirectory')
  if (!working || !exec?.agent) return null
  try {
    return await working.ensure(exec.agent, exec.signal)
  } catch {
    return null
  }
}

export function apply(ctx, config) {
  const configuredRoot = typeof config?.root === 'string' && config.root ? config.root : null
  const resolveRoot = async (args, exec) => {
    if (args?.root) return args.root
    if (configuredRoot) return configuredRoot
    return (await sessionRoot(ctx, exec)) ?? rootOf(args)
  }

  // Every registration is owned by this plugin's fiber: unloading removes it.
  const defineTool = (definition) => ctx.effect(() => ctx.tools.register(definition))

  defineTool({
    name: 'pmf_check',
    description:
      'Check project docs for structural defects: missing frontmatter fields, out-of-enum doc_kind/status, duplicate ids, broken relative links, unknown related ids, banned filename tokens. Read-only. Use before committing doc changes, or when asked whether the documentation set is self-consistent.',
    parameters: {
      type: 'object',
      properties: {
        root: ROOT_PARAM,
        write: { type: 'boolean', description: 'Also regenerate INDEX.md and .doc-index.json before reporting.' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const root = await resolveRoot(args, exec)
      if (args?.write) buildIndex(root)
      const result = check(root)
      if (!result.docsPresent) {
        return `No docs directory at ${result.docsDir}.\nCreate docs/ with a pmf.config.json, or pass root to point at the project that holds one. Nothing was checked.`
      }
      const meta = `${result.docs} docs · ${result.errors.length} errors · ${result.warnings.length} warnings`
      return `${meta}\n${formatViolations(result)}`
    },
  })

  defineTool({
    name: 'pmf_evidence',
    description:
      'Verify spec acceptance criteria against executable evidence: every checked AC must name an existing test file, and every deleted AC must cite an ADR. Reports which specs pass their close gate and what blocks them. Use before closing a work item or retiring a spec.',
    parameters: {
      type: 'object',
      properties: {
        root: ROOT_PARAM,
        spec: { type: 'string', description: 'Limit the report to one spec id, e.g. F033.' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const reports = evidence(await resolveRoot(args, exec), { spec: args?.spec })
      if (reports.length === 0) return 'No specs found.'
      return reports.map((report) => {
        const head = `${report.id ?? report.rel}: ${report.summary.met} met / ${report.summary.open} open / ${report.summary.deleted} deleted — close gate ${report.closeGate ? 'PASS' : 'BLOCKED'}`
        const blockers = report.blockers.map((ac) => `  - ${ac.id}: ${ac.reason}`)
        return [head, ...blockers].join('\n')
      }).join('\n\n')
    },
  })

  defineTool({
    name: 'pmf_retention',
    description:
      'Report the retention mode (fixed or dynamic plus whether it is still warming up), the measured document production rate, and every retired document with its retention days, due date and remaining time. Use to answer "what gets deleted, and when".',
    parameters: {
      type: 'object',
      properties: { root: ROOT_PARAM },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const report = retention(await resolveRoot(args, exec))
      const lines = [
        `mode: ${report.mode}${report.modeReason ? ` (${report.modeReason})` : ''}`,
        `enabled_at: ${report.enabledAt ?? 'never'}`,
        `lambda: ${report.lambda === null ? 'unavailable' : report.lambda.toFixed(2)} docs/week · samples ${report.samples}`,
      ]
      if (report.gitError) lines.push(`git: ${report.gitError}`)
      if (report.waiting.length === 0 && report.due.length === 0 && report.blocked.length === 0) {
        lines.push('', 'no retired documents')
      }
      for (const item of report.waiting) {
        lines.push(`WAIT ${item.id} r=${item.days}d due=${item.due} (${item.mode})`)
      }
      for (const item of report.due) lines.push(`DUE  ${item.id} r=${item.days}d due=${item.due} → ${item.rel}`)
      for (const item of report.blocked) lines.push(`BLOCK ${item.id ?? item.rel} — ${item.reason}`)
      return lines.join('\n')
    },
  })

  defineTool({
    name: 'pmf_expire',
    description:
      'List retired documents that are past their retention period, or delete them. Dry run by default. Deleting requires apply=true, respects the delete gate, and appends one tombstone row per removed document. Use only when the user asks to clean up retired docs.',
    parameters: {
      type: 'object',
      properties: {
        root: ROOT_PARAM,
        apply: { type: 'boolean', description: 'Actually delete. Omit or false for a dry run.' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const result = expire(await resolveRoot(args, exec), { apply: args?.apply === true })
      if (!result.applied) {
        const plan = result.plan
        const lines = [`dry run — ${plan.due.length} due, ${plan.waiting.length} waiting, ${plan.blocked.length} blocked`]
        for (const item of plan.due) lines.push(`DUE  ${item.id} (${item.kind}) r=${item.days}d due=${item.due} → ${item.rel}`)
        for (const item of plan.waiting) lines.push(`WAIT ${item.id} due=${item.due} (${item.days}d ${item.mode})`)
        for (const item of plan.blocked) lines.push(`BLOCK ${item.id ?? item.rel} — ${item.reason}`)
        return lines.join('\n')
      }
      return [`deleted ${result.deleted.length}`, ...result.deleted.map((item) => `- ${item.id} → ${item.successor}`)].join('\n')
    },
  })

  defineTool({
    name: 'pmf_enable_dynamic',
    description:
      'Turn on dynamic retention. Records enabled_at as now and starts measuring document production from this moment; history before it is never used and already-frozen retention days are never recalculated. Use only when the user explicitly asks to enable it.',
    parameters: {
      type: 'object',
      properties: { root: ROOT_PARAM },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const result = enableDynamic(await resolveRoot(args, exec))
      return result.changed
        ? `dynamic retention enabled at ${result.enabledAt}; config written to ${result.configPath}`
        : `unchanged: ${result.reason} (enabled_at ${result.enabledAt})`
    },
  })
  // The skills service is optional: the checker still works without it.
  const skills = ctx.get('skills')
  if (skills) {
    for (const skill of loadSkills()) ctx.effect(() => skills.register(skill))
  }
}
