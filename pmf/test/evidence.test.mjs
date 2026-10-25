import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAcs } from '../lib/evidence.js'

const body = `
## Acceptance criteria

- [x] AC-1: creates one node
      test: packages/api/test/node.test.js::creates one node
- [ ] AC-2: still open
- [-] AC-3: dropped on purpose, see ADR-0007
- [x] AC-4: no evidence at all
`

test('parses every AC state', () => {
  const acs = parseAcs(body)
  assert.equal(acs.length, 4)
  assert.deepEqual(acs.map((ac) => ac.status), ['met', 'open', 'deleted', 'met'])
})

test('reads test references from indented evidence lines', () => {
  const [first] = parseAcs(body)
  assert.equal(first.test, 'packages/api/test/node.test.js::creates one node')
})

test('picks up the cited ADR for deleted ACs', () => {
  const deleted = parseAcs(body).find((ac) => ac.id === 'AC-3')
  assert.equal(deleted.adr, 'ADR-0007')
})

test('an AC without test reference stays unidentified', () => {
  const bare = parseAcs(body).find((ac) => ac.id === 'AC-4')
  assert.equal(bare.test, null)
})
