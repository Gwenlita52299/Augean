import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { sourceHash } from './sourcehash.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const REQUIRED_FIELDS = ['doc_kind', 'id', 'status', 'created', 'updated', 'owner']
const PLACEHOLDER_ID = /[<>]/
const LINK_TARGET_RE = /^(https?:|mailto:|#)/

/**
 * Docs that describe the rules mention TODO/待补 inside code spans and tables.
 * Strip fenced blocks and inline code before looking for placeholders, otherwise
 * the rule reports the documentation of itself.
 */
function proseOf(body) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

function resolveLink(doc, target) {
  const path = target.split('#')[0].split('?')[0]
  if (!path) return null
  return resolve(dirname(doc.abs), path)
}

/**
 * Structural checks. Everything here is mechanically decidable, so the level is
 * `error`; judgement calls belong to the workflow layer, not to this function.
 */
export function checkDocs(scan, config) {
  const violations = []
  const add = (level, code, doc, message) =>
    violations.push({ level, code, file: doc.rel, message })

  for (const doc of scan.docs) {
    const whitelisted = doc.isRoot && config.rootWhitelist.includes(doc.rel)

    for (const link of doc.links) {
      if (LINK_TARGET_RE.test(link)) continue
      const abs = resolveLink(doc, link)
      if (abs && !existsSync(abs)) add('error', 'LINK_BROKEN', doc, `link target missing: ${link}`)
    }

    if (whitelisted) continue
    if (doc.generated) continue

    if (!doc.fm.present) {
      add('error', 'FM_MISSING', doc, 'no frontmatter block')
      continue
    }
    if (doc.fm.error) add('error', 'FM_PARSE', doc, doc.fm.error)
    for (const key of doc.fm.duplicates) add('error', 'FM_DUPLICATE', doc, `duplicate key: ${key}`)

    for (const field of REQUIRED_FIELDS) {
      const value = doc.fm.data[field]
      if (value === null || value === undefined || value === '') {
        add('error', 'FM_REQUIRED', doc, `missing required field: ${field}`)
      }
    }

    if (doc.kind && !config.kinds.includes(doc.kind)) {
      add('error', 'KIND_ENUM', doc, `doc_kind not in enum: ${doc.kind}`)
    }
    if (doc.status && !config.statuses.includes(doc.status)) {
      add('error', 'STATUS_ENUM', doc, `status not in enum: ${doc.status}`)
    }

    for (const field of ['created', 'updated']) {
      const value = doc.fm.data[field]
      if (typeof value !== 'string' || !DATE_RE.test(value)) {
        add('error', 'DATE_FORMAT', doc, `${field} must be YYYY-MM-DD`)
      }
    }
    if (typeof doc.created === 'string' && typeof doc.updated === 'string'
      && DATE_RE.test(doc.created) && DATE_RE.test(doc.updated) && doc.updated < doc.created) {
      add('error', 'DATE_ORDER', doc, 'updated is earlier than created')
    }

    if (doc.status === 'retired' && !DATE_RE.test(String(doc.retiredAt ?? ''))) {
      add('error', 'RETIRED_AT', doc, 'status=retired requires retired_at: YYYY-MM-DD')
    }

    const isTemplate = PLACEHOLDER_ID.test(String(doc.id ?? ''))
    if (isTemplate) continue

    if (doc.id) {
      const sameId = scan.idIndex.get(doc.id) ?? []
      if (sameId.length > 1) {
        const others = sameId.filter((other) => other.rel !== doc.rel).map((other) => other.rel)
        add('error', 'ID_DUP', doc, `id ${doc.id} also used by ${others.join(', ')}`)
      }
    }

    for (const relatedId of doc.related) {
      if (!scan.idIndex.has(relatedId)) add('error', 'RELATED_UNKNOWN', doc, `related id not found: ${relatedId}`)
    }

    if (doc.rel.startsWith('specs/')) {
      const segments = doc.rel.split('/')
      if (segments.length >= 3 && segments[1] !== doc.id) {
        add('error', 'SPEC_DIR_ID', doc, `directory ${segments[1]} must equal id ${doc.id}`)
      }
    }

    const base = doc.rel.split('/').pop().replace(/\.md$/, '')
    const tokens = base.toLowerCase().split(/[-_.]/)
    const banned = tokens.find((token) => config.bannedNameParts.includes(token))
    if (banned) add('warn', 'NAME_BANNED', doc, `filename contains banned token: ${banned}`)

    if (/\bTODO\b|待补|待填/.test(proseOf(doc.body))) add('warn', 'PLACEHOLDER_TEXT', doc, 'body contains placeholder text')

    // A generated artifact that no longer matches its sources is worse than absent:
    // it describes a system that has moved. Measurable only because the generator
    // declares what it reads.
    if (doc.kind === 'explainer' && doc.regen && doc.sourceSha && doc.sourcePaths.length > 0) {
      const actual = sourceHash(scan.root, doc.sourcePaths)
      if (actual !== doc.sourceSha) {
        add('warn', 'EXPLAINER_STALE', doc, `source_sha ${doc.sourceSha} != ${actual}; rebuild or delete`)
      }
    }
  }

  const errors = violations.filter((item) => item.level === 'error')
  const warnings = violations.filter((item) => item.level === 'warn')
  return { violations, errors, warnings, ok: errors.length === 0 }
}

export function formatViolations(result) {
  if (result.violations.length === 0) return 'No issues.'
  return result.violations
    .map((item) => `${item.level === 'error' ? 'ERROR' : 'WARN '} ${item.code} ${item.file} — ${item.message}`)
    .join('\n')
}
