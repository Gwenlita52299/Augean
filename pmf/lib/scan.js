import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { docsDir } from './config.js'
import { asList, parseFrontmatter } from './frontmatter.js'

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g
const HREF_RE = /href="([^"]+)"/g
const GENERATED_RE = /<!--\s*generated/

/**
 * An explainer is an HTML artifact, so its frontmatter travels inside a leading
 * comment in the same --- delimited shape. Unwrapping keeps one parser for both.
 */
function unwrapHtmlFrontmatter(text) {
  const open = /^<!--\s*\n?/.exec(text)
  if (!open) return text
  const end = text.indexOf('-->')
  if (end === -1) return text
  const inner = text.slice(open[0].length, end)
  if (!inner.trimStart().startsWith('---')) return text
  return `${inner.trimStart()}\n${text.slice(end + 3)}`
}

function toPosix(path) {
  return path.split(sep).join('/')
}

function walk(dir, excluded, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (excluded.has(entry.name)) continue
      walk(abs, excluded, out)
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.html'))) {
      out.push(abs)
    }
  }
}

function inferKind(rel) {
  const top = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : ''
  return { prd: 'prd', specs: 'spec', designs: 'design', decisions: 'adr', notes: 'note', explainers: 'explainer' }[top] ?? null
}

/**
 * @returns {{root: string, dir: string, docs: Array, idIndex: Map<string, Array>}}
 */
export function scanDocs(root, config) {
  const dir = docsDir(root, config)
  const excluded = new Set(config.exclude ?? [])
  const files = []
  walk(dir, excluded, files)
  files.sort()

  const docs = []
  const idIndex = new Map()

  for (const abs of files) {
    const rel = toPosix(relative(dir, abs))
    const isHtml = abs.endsWith('.html')
    const raw = readFileSync(abs, 'utf8')
    const text = isHtml ? unwrapHtmlFrontmatter(raw) : raw
    const fm = parseFrontmatter(text)
    const links = []
    for (const match of fm.body.matchAll(LINK_RE)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      links.push(target)
    }
    if (isHtml) {
      for (const match of fm.body.matchAll(HREF_RE)) {
        const target = match[1]
        if (/^(https?:|mailto:|#|data:)/.test(target)) continue
        links.push(target)
      }
    }
    const doc = {
      abs,
      rel,
      isRoot: !rel.includes('/'),
      kind: typeof fm.data.doc_kind === 'string' ? fm.data.doc_kind : inferKind(rel),
      id: typeof fm.data.id === 'string' ? fm.data.id : null,
      status: typeof fm.data.status === 'string' ? fm.data.status : null,
      owner: typeof fm.data.owner === 'string' ? fm.data.owner : null,
      created: fm.data.created ?? null,
      updated: fm.data.updated ?? null,
      retiredAt: fm.data.retired_at ?? null,
      related: asList(fm.data.related),
      workItems: asList(fm.data.work_items),
      regen: typeof fm.data.regen === 'string' ? fm.data.regen : null,
      sourceSha: typeof fm.data.source_sha === 'string' ? fm.data.source_sha : null,
      sourcePaths: asList(fm.data.source_paths),
      cost: typeof fm.data.cost === 'string' ? fm.data.cost : null,
      generated: GENERATED_RE.test(fm.body),
      fm,
      text,
      body: fm.body,
      links,
    }
    docs.push(doc)
    if (doc.id) {
      const bucket = idIndex.get(doc.id) ?? []
      bucket.push(doc)
      idIndex.set(doc.id, bucket)
    }
  }

  return { root, dir, docs, idIndex }
}
