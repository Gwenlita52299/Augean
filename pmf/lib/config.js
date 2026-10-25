import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Fixed retention defaults (days). Conservative: later deletion, never earlier. */
export const FIXED_DEFAULTS = { spec: 30, design: 60, prd: 60, note: 30, explainer: 60 }

export const DEFAULT_CONFIG = {
  docsRoot: 'docs',
  exclude: ['node_modules', '.git', 'templates'],
  rootWhitelist: ['README.md', 'AGENTS.md', 'CLAUDE.md', 'GLOSSARY.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE'],
  kinds: ['prd', 'spec', 'design', 'explainer', 'note', 'adr', 'glossary'],
  statuses: ['draft', 'active', 'retired'],
  bannedNameParts: ['final', 'new', 'old', 'tmp', 'draft', 'copy', 'v2', '最新', '临时', '副本'],
  retention: {
    mode: 'fixed',
    fixed: { ...FIXED_DEFAULTS },
    mKind: { spec: 1, design: 2, prd: 2, note: 1, explainer: 1 },
    wCost: { cheap: 0.25, medium: 1, expensive: 2 },
    dynamic: {
      enabled_at: null,
      n_target: 30,
      lambda_window_weeks: 8,
      warmup_weeks: 4,
      min_samples: 8,
      clamp: [3, 90],
    },
  },
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function merge(base, patch) {
  const out = { ...base }
  for (const [key, value] of Object.entries(patch ?? {})) {
    out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value
  }
  return out
}

/** Config lives at <root>/pmf.config.json, else <root>/docs/pmf.config.json. */
export function configPath(root) {
  const top = join(root, 'pmf.config.json')
  if (existsSync(top)) return top
  const nested = join(root, 'docs', 'pmf.config.json')
  return existsSync(nested) ? nested : null
}

export function loadConfig(root) {
  const path = configPath(root)
  if (!path) return { config: merge(DEFAULT_CONFIG, {}), path: null }
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return { config: merge(DEFAULT_CONFIG, raw), path }
}

/** Absolute directory that holds documents. */
export function docsDir(root, config) {
  return config.docsRoot === '.' ? root : join(root, config.docsRoot)
}
