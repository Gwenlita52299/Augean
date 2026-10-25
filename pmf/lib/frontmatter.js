/**
 * Minimal frontmatter reader for the YAML subset this framework uses:
 * scalars, inline arrays, and quoted strings. No nested maps, no block arrays.
 * Unknown constructs are reported as errors instead of being guessed at.
 */

const FM_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

function stripComment(value) {
  let quote = null
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd()
    }
  }
  return value.trimEnd()
}

function parseScalar(raw) {
  const text = stripComment(raw).trim()
  if (text === '') return null
  if (text === 'null' || text === '~') return null
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  if (/^"(.*)"$/s.test(text) || /^'(.*)'$/s.test(text)) return text.slice(1, -1)
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((part) => parseScalar(part))
  }
  return text
}

/**
 * @returns {{present: boolean, data: Record<string, unknown>, body: string,
 *            error: string|null, duplicates: string[]}}
 */
export function parseFrontmatter(text) {
  const match = FM_RE.exec(text)
  if (!match) return { present: false, data: {}, body: text, error: null, duplicates: [] }

  const data = {}
  const duplicates = []
  let error = null

  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const pair = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line)
    if (!pair) {
      if (/^\s+\S/.test(line)) {
        error ??= `unsupported nested frontmatter line: ${line.trim().slice(0, 60)}`
        continue
      }
      error ??= `unparseable frontmatter line: ${line.trim().slice(0, 60)}`
      continue
    }
    const key = pair[1]
    if (Object.hasOwn(data, key)) duplicates.push(key)
    data[key] = parseScalar(pair[2])
  }

  return { present: true, data, body: text.slice(match[0].length), error, duplicates }
}

/** Normalize a scalar or list field into a string array. */
export function asList(value) {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== '').map(String)
  return [String(value)]
}
