import { readFileSync } from 'node:fs'

/**
 * Version of the JSON every surface consumes (CLI --json, MCP, CI). Bump on any
 * breaking change to field names or shapes; adapters compare it, not the core version.
 */
export const SCHEMA_VERSION = 1

export const CORE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

function parse(version) {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version).trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null
}

/**
 * Minimal range check for the `requires` config field. Supports an exact version
 * ("0.3.1") and caret ranges ("^0.3", "^1.2.0") with npm's caret semantics: for 0.x
 * the minor is the compatibility boundary. Anything else is reported as unparseable
 * rather than guessed at.
 *
 * @returns {{ok: boolean, reason?: string}}
 */
export function satisfies(version, range) {
  const have = parse(version)
  if (!have) return { ok: false, reason: `core version ${version} is not x.y.z` }
  const caret = String(range).trim().startsWith('^')
  const want = parse(caret ? String(range).trim().slice(1) : range)
  if (!want) return { ok: false, reason: `unsupported range: ${range} (use x.y.z or ^x.y[.z])` }
  const cmp = have[0] - want[0] || have[1] - want[1] || have[2] - want[2]
  if (!caret) return cmp === 0 ? { ok: true } : { ok: false, reason: `core ${version} != required ${range}` }
  const sameLine = want[0] > 0 ? have[0] === want[0] : have[0] === 0 && have[1] === want[1]
  return sameLine && cmp >= 0 ? { ok: true } : { ok: false, reason: `core ${version} does not satisfy ${range}` }
}
