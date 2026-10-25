import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

const AC_RE = /^-\s*\[([xX\s-])\]\s*(AC-[\w.\-]+)\s*:\s*(.*)$/
const TEST_RE = /^\s+test:\s*(.+?)\s*$/
const ADR_RE = /\bADR-\d+\b/

/**
 * Parse AC blocks. Evidence lives either on the AC line or on the indented
 * lines that follow it, up to the next AC.
 */
export function parseAcs(body) {
  const lines = body.split(/\r?\n/)
  const acs = []
  let current = null

  for (const line of lines) {
    const match = AC_RE.exec(line)
    if (match) {
      if (current) acs.push(current)
      const mark = match[1].trim()
      current = {
        id: match[2],
        status: mark === 'x' || mark === 'X' ? 'met' : mark === '-' ? 'deleted' : 'open',
        text: match[3].trim(),
        test: null,
        adr: null,
      }
      const inline = TEST_RE.exec(line)
      if (inline) current.test = inline[1]
      const adr = ADR_RE.exec(match[3])
      if (adr) current.adr = adr[0]
      continue
    }
    if (!current) continue
    const test = TEST_RE.exec(line)
    if (test && !current.test) {
      current.test = test[1]
      continue
    }
    const adr = ADR_RE.exec(line)
    if (adr && !current.adr) current.adr = adr[0]
  }
  if (current) acs.push(current)
  return acs
}

function testPathExists(root, reference) {
  const path = reference.split('::')[0].trim()
  if (!path) return { ok: false, reason: 'empty test reference' }
  const abs = isAbsolute(path) ? path : join(root, path)
  if (!existsSync(abs)) return { ok: false, reason: `test file missing: ${path}` }
  return { ok: true }
}

/**
 * Close-gate evidence for one spec.
 * met     → test file exists
 * open    → blocks retirement
 * deleted → needs an ADR id
 */
export function checkEvidence(doc, root) {
  const acs = parseAcs(doc.body).map((ac) => {
    if (ac.status === 'met') {
      if (!ac.test) return { ...ac, ok: false, reason: 'met without test:' }
      const exists = testPathExists(root, ac.test)
      return { ...ac, ok: exists.ok, reason: exists.reason ?? null }
    }
    if (ac.status === 'deleted') {
      return ac.adr ? { ...ac, ok: true, reason: null } : { ...ac, ok: false, reason: 'deleted without ADR id' }
    }
    return { ...ac, ok: false, reason: 'open' }
  })

  const summary = {
    met: acs.filter((ac) => ac.status === 'met').length,
    open: acs.filter((ac) => ac.status === 'open').length,
    deleted: acs.filter((ac) => ac.status === 'deleted').length,
  }
  const blockers = acs.filter((ac) => !ac.ok)
  return {
    id: doc.id,
    rel: doc.rel,
    acs,
    summary,
    blockers,
    closeGate: acs.length > 0 && blockers.length === 0,
  }
}
