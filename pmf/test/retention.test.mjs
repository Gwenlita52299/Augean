import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CONFIG } from '../lib/config.js'
import { resolveMode, retentionDays } from '../lib/retention.js'

const config = structuredClone(DEFAULT_CONFIG)
const DAY = 86400000
const NOW = Date.parse('2026-10-25T00:00:00Z')

test('fixed mode returns conservative values per kind', () => {
  assert.equal(retentionDays({ kind: 'spec' }, config, 'fixed', 20), 30)
  assert.equal(retentionDays({ kind: 'design' }, config, 'fixed', 20), 60)
  assert.equal(retentionDays({ kind: 'note' }, config, 'fixed', 20), 30)
})

test('a regenerable explainer is zero even in dynamic mode', () => {
  assert.equal(retentionDays({ kind: 'explainer', regen: 'npm run x' }, config, 'dynamic', 5), 0)
  assert.equal(retentionDays({ kind: 'explainer', regen: 'npm run x' }, config, 'fixed', 5), 0)
})

test('dynamic shrinks as production rises', () => {
  const spec = { kind: 'spec' }
  const slow = retentionDays(spec, config, 'dynamic', 1)
  const fast = retentionDays(spec, config, 'dynamic', 5)
  assert.ok(slow > fast, `${slow} should exceed ${fast}`)
  assert.equal(slow, 30) // 30/1 * 1 * 1
  assert.equal(fast, 6) // 30/5
})

test('dynamic clamps at both ends', () => {
  const spec = { kind: 'spec' }
  assert.equal(retentionDays(spec, config, 'dynamic', 0), 90) // zero-rate floor
  assert.equal(retentionDays(spec, config, 'dynamic', 1000), 3) // lower clamp
})

test('switch off means fixed regardless of lambda', () => {
  const info = resolveMode(config, NOW, 999)
  assert.equal(info.mode, 'fixed')
  assert.match(info.reason, /switch/)
})

test('warmup keeps fixed until the window matures', () => {
  const dynamic = structuredClone(config)
  dynamic.retention.mode = 'dynamic'
  dynamic.retention.dynamic.enabled_at = new Date(NOW - 10 * DAY).toISOString()
  const warming = resolveMode(dynamic, NOW, 100)
  assert.equal(warming.mode, 'fixed')
  assert.match(warming.reason, /warmup/)

  const mature = structuredClone(dynamic)
  mature.retention.dynamic.enabled_at = new Date(NOW - 40 * DAY).toISOString()
  assert.equal(resolveMode(mature, NOW, 100).mode, 'dynamic')
})

test('too few samples keeps fixed', () => {
  const dynamic = structuredClone(config)
  dynamic.retention.mode = 'dynamic'
  dynamic.retention.dynamic.enabled_at = new Date(NOW - 40 * DAY).toISOString()
  const info = resolveMode(dynamic, NOW, 2)
  assert.equal(info.mode, 'fixed')
  assert.match(info.reason, /samples/)
})
