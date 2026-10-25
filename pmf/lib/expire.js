import { appendFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkEvidence } from './evidence.js'
import { dueAt, retentionDays } from './retention.js'

const TOMBSTONE_HEADER = 'id\tkind\tdeleted_at\tsuccessor\ttitle'
const ADR_RE = /\bADR-\d+\b/

export function tombstonesPath(dir) {
  return join(dir, 'TOMBSTONES.tsv')
}

function titleOf(doc) {
  const heading = /^#\s+(.+)$/m.exec(doc.body)
  return (heading ? heading[1] : doc.rel).replace(/\t/g, ' ').trim()
}

function successorOf(doc, root) {
  if (doc.kind === 'spec') {
    const evidence = checkEvidence(doc, root)
    const met = evidence.acs.find((ac) => ac.status === 'met' && ac.test)
    return met ? met.test.split('::')[0] : '-'
  }
  if (doc.kind === 'design' || doc.kind === 'prd') {
    const adr = ADR_RE.exec(doc.body)
    return adr ? adr[0] : '-'
  }
  return '-'
}

/** The delete gate: never remove the last copy of knowledge. */
export function deleteGate(doc, root) {
  if (doc.kind === 'adr' || doc.kind === 'glossary') {
    return { ok: false, reason: `${doc.kind} can never be retired` }
  }
  if (doc.kind === 'spec') {
    const evidence = checkEvidence(doc, root)
    if (!evidence.closeGate) {
      return { ok: false, reason: `close gate: ${evidence.blockers.length} AC not backed by tests` }
    }
  }
  if (doc.kind === 'design' || doc.kind === 'prd') {
    if (!ADR_RE.test(doc.body)) return { ok: false, reason: 'no ADR cited for the change of direction' }
  }
  return { ok: true, reason: null }
}

/**
 * Build the expiry plan. Missing frozen values are computed now but not persisted
 * unless `apply` runs, so a dry run never mutates state.
 */
export function planExpiry(scan, config, state, context) {
  const { now, mode, lambda } = context
  const due = []
  const waiting = []
  const blocked = []
  const pendingFreeze = {}

  for (const doc of scan.docs) {
    if (doc.status !== 'retired') continue
    if (!doc.id) {
      blocked.push({ rel: doc.rel, id: null, reason: 'retired without id' })
      continue
    }

    let frozen = state.retired[doc.id]
    if (!frozen || typeof frozen.days !== 'number') {
      const days = retentionDays(doc, config, mode, lambda)
      frozen = { days, at: String(doc.retiredAt ?? ''), mode, frozen_at: new Date(now).toISOString().slice(0, 10) }
      pendingFreeze[doc.id] = frozen
    }

    const timing = dueAt(doc, { retired: { ...state.retired, [doc.id]: frozen } }, config)
    const gate = deleteGate(doc, scan.root)
    const record = {
      id: doc.id,
      rel: doc.rel,
      kind: doc.kind,
      title: titleOf(doc),
      days: frozen.days,
      mode: frozen.mode ?? mode,
      retiredAt: timing?.retiredAt ?? frozen.at,
      due: timing?.due ? timing.due.toISOString().slice(0, 10) : null,
      gate,
    }
    if (!record.due) {
      blocked.push({ ...record, reason: 'cannot compute due date (missing retired_at)' })
      continue
    }
    if (!gate.ok) {
      blocked.push({ ...record, reason: gate.reason })
      continue
    }
    if (timing.due.getTime() <= now) due.push(record)
    else waiting.push(record)
  }

  return { due, waiting, blocked, pendingFreeze }
}

export function applyExpiry(scan, config, state, context) {
  const plan = planExpiry(scan, config, state, context)
  const dir = scan.dir
  const today = new Date(context.now).toISOString().slice(0, 10)
  const deleted = []

  if (plan.due.length > 0 && !existsSync(tombstonesPath(dir))) {
    writeFileSync(tombstonesPath(dir), `${TOMBSTONE_HEADER}\n`)
  }

  for (const item of plan.due) {
    const doc = scan.docs.find((candidate) => candidate.id === item.id)
    if (!doc) continue
    const successor = successorOf(doc, scan.root)
    unlinkSync(doc.abs)
    appendFileSync(
      tombstonesPath(dir),
      `${item.id}\t${item.kind}\t${today}\t${successor}\t${item.title}\n`,
    )
    delete state.retired[item.id]
    deleted.push({ ...item, successor })
  }

  for (const [id, frozen] of Object.entries(plan.pendingFreeze)) {
    if (deleted.some((item) => item.id === id)) continue
    state.retired[id] = frozen
  }

  return { deleted, waiting: plan.waiting, blocked: plan.blocked, state }
}
