import assert from 'node:assert/strict'
import test from 'node:test'
import { asList, parseFrontmatter } from '../lib/frontmatter.js'

test('parses scalars, inline arrays and comments', () => {
  const doc = `---
doc_kind: spec          # the kind
id: F033
status: active
created: 2026-10-25
owner: fairy
work_items: [F033, F034]
verified_at: null
retired_at:
---

# Title
body`
  const { present, data, body, error } = parseFrontmatter(doc)
  assert.equal(present, true)
  assert.equal(error, null)
  assert.equal(data.doc_kind, 'spec')
  assert.equal(data.owner, 'fairy')
  assert.deepEqual(data.work_items, ['F033', 'F034'])
  assert.equal(data.verified_at, null)
  assert.equal(data.retired_at, null)
  assert.match(body, /# Title/)
})

test('keeps a # that is not a trailing comment', () => {
  const { data } = parseFrontmatter('---\ntitle: "issue #42 fix"\n---\n')
  assert.equal(data.title, 'issue #42 fix')
})

test('reports unsupported nested lines instead of guessing', () => {
  const { error } = parseFrontmatter('---\nowner:\n  name: fairy\n---\n')
  assert.match(error, /unsupported nested/)
})

test('detects duplicate keys', () => {
  const { duplicates } = parseFrontmatter('---\nid: A\nid: B\n---\n')
  assert.deepEqual(duplicates, ['id'])
})

test('reports absence of frontmatter', () => {
  const { present } = parseFrontmatter('# just a heading\n')
  assert.equal(present, false)
})

test('asList normalizes scalars, lists and empties', () => {
  assert.deepEqual(asList(null), [])
  assert.deepEqual(asList('F033'), ['F033'])
  assert.deepEqual(asList(['A', null, 'B']), ['A', 'B'])
})
