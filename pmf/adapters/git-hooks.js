import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Git-hook surface. This is trigger-layer code (02 §7): it decides *when* the core
 * runs and never how. It lives outside lib/ so the core stays harness-free.
 */

export const MARKER = '# pmf-hook: managed by `pmf hooks install`'

const DEFAULT_BIN = fileURLToPath(new URL('../bin/pmf.mjs', import.meta.url))

/** What each hook runs. pre-commit sees only the staged set; pre-push sees everything. */
export const HOOKS = {
  'pre-commit': 'check --changed-only --root .',
  'pre-push': 'check --root .',
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function locate(root) {
  try {
    git(root, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    throw new Error(`hooks need a git work tree; ${root} is not one`)
  }
  // --git-path honours core.hooksPath and worktrees; --show-prefix keeps a project
  // that lives in a subdirectory of the repo pointing at itself, not the repo top.
  return {
    hooksDir: resolve(root, git(root, ['rev-parse', '--git-path', 'hooks'])),
    prefix: git(root, ['rev-parse', '--show-prefix']),
  }
}

export function hookScript(command, { bin = DEFAULT_BIN, prefix = '' } = {}) {
  return `#!/bin/sh
${MARKER}; remove with \`pmf hooks uninstall\`
PMF_BIN="\${PMF_BIN:-${bin.replace(/["\\$`]/g, '\\$&')}}"
if [ ! -f "$PMF_BIN" ]; then
  echo "pmf hook: $PMF_BIN not found. Reinstall with 'pmf hooks install' or set PMF_BIN." >&2
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"/${shQuote(prefix)} || exit 1
exec node "$PMF_BIN" ${command}
`
}

function ours(path) {
  return existsSync(path) && readFileSync(path, 'utf8').includes(MARKER)
}

/**
 * Install pre-commit / pre-push. A hook that pmf did not write is never
 * overwritten unless force is set: someone else's hook is someone else's gate.
 *
 * @returns {{hooksDir: string, installed: string[], skipped: Array<{hook: string, reason: string}>}}
 */
export function installHooks(root, { force = false, bin = DEFAULT_BIN } = {}) {
  const { hooksDir, prefix } = locate(root)
  mkdirSync(hooksDir, { recursive: true })
  const installed = []
  const skipped = []
  for (const [hook, command] of Object.entries(HOOKS)) {
    const path = join(hooksDir, hook)
    if (existsSync(path) && !ours(path) && !force) {
      skipped.push({ hook, reason: `existing ${hook} hook was not written by pmf; rerun with --force to replace it` })
      continue
    }
    writeFileSync(path, hookScript(command, { bin, prefix }))
    chmodSync(path, 0o755)
    installed.push(hook)
  }
  return { hooksDir, installed, skipped }
}

/** Remove only hooks carrying the pmf marker. */
export function uninstallHooks(root) {
  const { hooksDir } = locate(root)
  const removed = []
  for (const hook of Object.keys(HOOKS)) {
    const path = join(hooksDir, hook)
    if (ours(path)) {
      rmSync(path)
      removed.push(hook)
    }
  }
  return { hooksDir, removed }
}
