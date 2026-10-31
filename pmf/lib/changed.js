import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * Files changed in the working change set, as absolute paths.
 *
 * - default: the staged set (what pre-commit is about to record)
 * - since:   everything that differs between <since> and HEAD (pre-push, CI)
 *
 * Deleted paths are excluded: there is nothing left to check in them. A deletion
 * that breaks links elsewhere is caught by the full check on pre-push / CI.
 *
 * Throws when git is unavailable. Callers must not turn that into an empty set:
 * "nothing changed" and "could not tell" are different answers.
 */
export function changedFiles(root, { since = null } = {}) {
  try {
    git(root, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    throw new Error(`--changed-only needs a git work tree; ${root} is not one`)
  }
  const args = since
    ? ['diff', '--name-only', '--relative', '--diff-filter=ACMR', `${since}...HEAD`]
    : ['diff', '--cached', '--name-only', '--relative', '--diff-filter=ACMR']
  const out = git(root, args)
  return new Set(out.split('\n').filter(Boolean).map((rel) => resolve(root, rel)))
}
