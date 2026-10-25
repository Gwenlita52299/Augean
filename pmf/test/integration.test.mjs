import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildIndex, check, evidence, expire, retention } from '../lib/api.js'
import { sourceHash } from '../lib/sourcehash.js'

const DAY = 86400000
const NOW = Date.parse('2026-10-25T00:00:00Z')

function isoDaysAgo(days) {
  return new Date(NOW - days * DAY).toISOString().slice(0, 10)
}

function write(root, rel, text) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, text)
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'pmf-'))
  write(root, 'test/node.test.js', 'test("creates one node", () => {})\n')
  write(root, 'test/session.test.js', 'test("keeps revision", () => {})\n')
  return root
}

function spec(id, { status = 'active', retiredAt = null, aCs = '' } = {}) {
  return `---
doc_kind: spec
id: ${id}
status: ${status}
created: ${isoDaysAgo(60)}
updated: ${isoDaysAgo(40)}
owner: fairy
${retiredAt ? `retired_at: ${retiredAt}` : ''}
---

# ${id} spec

## Acceptance criteria

${aCs}
`
}

test('check reports structural defects and passes a clean set', () => {
  const root = project()
  write(root, 'docs/specs/F001/spec.md', spec('F001', {
    aCs: '- [x] AC-1: creates one node\n      test: test/node.test.js::creates one node\n',
  }))
  assert.equal(check(root).ok, true)

  write(root, 'docs/notes/bad.md', `---
doc_kind: note
id: F001
status: archived
---

# dup
[dead](../missing.md)
`)
  const result = check(root)
  const codes = new Set(result.errors.map((item) => item.code))
  assert.ok(codes.has('STATUS_ENUM'), 'status must be rejected')
  assert.ok(codes.has('ID_DUP'), 'duplicate id must be rejected')
  assert.ok(codes.has('LINK_BROKEN'), 'dead link must be rejected')
  assert.ok(codes.has('FM_REQUIRED'), 'missing owner must be rejected')
  assert.equal(result.ok, false)
})

test('placeholder text inside code spans is not a violation', () => {
  const root = project()
  write(root, 'docs/notes/rules.md', `---
doc_kind: note
id: NOTE-RULES
status: active
created: ${isoDaysAgo(1)}
updated: ${isoDaysAgo(1)}
owner: fairy
---

# rules
The checker warns on \`TODO\` and \`待补\` inside prose.
`)
  const result = check(root)
  assert.equal(result.warnings.length, 0)
})

test('a spec whose ACs all have tests passes the close gate and then expires', () => {
  const root = project()
  write(root, 'docs/specs/F002/spec.md', spec('F002', {
    status: 'retired',
    retiredAt: isoDaysAgo(100),
    aCs: '- [x] AC-1: keeps revision\n      test: test/session.test.js::keeps revision\n',
  }))

  const gate = evidence(root, { spec: 'F002' })
  assert.equal(gate[0].closeGate, true)

  const plan = expire(root, { now: NOW })
  assert.equal(plan.plan.due.length, 1)
  assert.equal(plan.plan.due[0].days, 30)

  const applied = expire(root, { apply: true, now: NOW })
  assert.equal(applied.deleted.length, 1)
  assert.equal(applied.deleted[0].successor, 'test/session.test.js')

  const tombstones = readFileSync(join(root, 'docs/TOMBSTONES.tsv'), 'utf8')
  assert.match(tombstones, /^F002\tspec\t2026-10-25\ttest\/session\.test\.js\t/m)
})

test('a spec with an open AC is blocked from retiring', () => {
  const root = project()
  write(root, 'docs/specs/F003/spec.md', spec('F003', {
    status: 'retired',
    retiredAt: isoDaysAgo(100),
    aCs: '- [ ] AC-1: not done\n',
  }))
  const plan = expire(root, { now: NOW })
  assert.equal(plan.plan.due.length, 0)
  assert.equal(plan.plan.blocked.length, 1)
  assert.match(plan.plan.blocked[0].reason, /close gate/)
})

test('retention freezes on first sight and ignores later lambda changes', () => {
  const root = project()
  write(root, 'docs/specs/F004/spec.md', spec('F004', {
    status: 'retired',
    retiredAt: isoDaysAgo(1),
    aCs: '- [x] AC-1: keeps revision\n      test: test/session.test.js::keeps revision\n',
  }))
  const first = retention(root, { now: NOW })
  assert.equal(first.waiting.length, 1)
  assert.equal(first.waiting[0].days, 30)
  assert.equal(first.mode, 'fixed')
})

test('index lists live docs and is regenerated from frontmatter', () => {
  const root = project()
  write(root, 'docs/specs/F005/spec.md', spec('F005'))
  const result = buildIndex(root, { now: NOW })
  assert.equal(result.indexed, 1)
  const index = readFileSync(join(root, 'docs/INDEX.md'), 'utf8')
  assert.match(index, /generated: do not edit/)
  assert.match(index, /F005/)
})

test('a generated explainer whose sources moved is flagged stale', () => {
  const root = project()
  write(root, 'docs/notes/source.md', `---
doc_kind: note
id: NOTE-SRC
status: active
created: ${isoDaysAgo(1)}
updated: ${isoDaysAgo(1)}
owner: fairy
---

# source
`)

  const explainer = (sha) => `<!--
---
doc_kind: explainer
id: EXPLAINER-page
status: active
created: ${isoDaysAgo(1)}
updated: ${isoDaysAgo(1)}
owner: fairy
source_sha: ${sha}
source_paths: [docs/notes]
regen: node build.mjs
cost: cheap
---
-->
<!DOCTYPE html><html><body>page</body></html>
`

  write(root, 'docs/explainers/page.html', explainer('deadbeefdead'))
  const stale = check(root)
  assert.ok(stale.warnings.some((item) => item.code === 'EXPLAINER_STALE'), 'mismatched hash must warn')

  write(root, 'docs/explainers/page.html', explainer(sourceHash(root, ['docs/notes'])))
  const fresh = check(root)
  assert.equal(fresh.warnings.filter((item) => item.code === 'EXPLAINER_STALE').length, 0, 'matching hash must stay quiet')
})
