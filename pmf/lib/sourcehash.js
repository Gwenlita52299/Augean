import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EXTENSIONS = ['.md', '.js', '.mjs']

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, out)
    else if (EXTENSIONS.includes(entry.name.slice(entry.name.lastIndexOf('.')))) out.push(abs)
  }
}

/**
 * Content fingerprint of the sources a generated artifact describes.
 * Deliberately not a commit sha: the question is only "did the source change",
 * which must stay answerable without git.
 */
export function sourceHash(root, paths) {
  const files = []
  for (const rel of paths) {
    const cleaned = rel.replace(/\/+$/, '')
    const abs = join(root, cleaned)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) walk(abs, files)
    else files.push(abs)
  }
  files.sort()
  const hash = createHash('sha256')
  for (const abs of files) {
    hash.update(relative(root, abs))
    hash.update(readFileSync(abs))
  }
  return hash.digest('hex').slice(0, 12)
}
