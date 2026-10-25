import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './lib/frontmatter.js'

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'skills')
const ORDER = ['spec-write', 'spec-close', 'spec-sync', 'spec-gc']

/**
 * Skills are authored as markdown with frontmatter so they read like normal docs
 * and stay editable outside the build. Registration consumes the parsed form.
 */
export function loadSkills(dir = DEFAULT_DIR) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const { data, body, error } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'))
      if (error) throw new Error(`${file}: ${error}`)
      if (!data.name || !data.description) throw new Error(`${file}: name and description are required`)
      const name = String(data.name)
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`${file}: name must be kebab-case`)
      return {
        name,
        description: String(data.description),
        ...(data.when_to_use ? { whenToUse: String(data.when_to_use) } : {}),
        source: 'runtime',
        content: body.trim(),
      }
    })
    .sort((a, b) => {
      const rank = (name) => {
        const index = ORDER.indexOf(name)
        return index === -1 ? ORDER.length : index
      }
      return rank(a.name) - rank(b.name)
    })
}
