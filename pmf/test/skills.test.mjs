import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSkills } from '../skills.js'

const skills = loadSkills()

test('loads the four lifecycle skills in workflow order', () => {
  assert.deepEqual(skills.map((skill) => skill.name), ['spec-write', 'spec-close', 'spec-sync', 'spec-gc'])
})

test('every skill carries the fields discovery depends on', () => {
  for (const skill of skills) {
    assert.match(skill.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${skill.name} must be kebab-case`)
    assert.ok(skill.description.length >= 30, `${skill.name} description too short to be discoverable`)
    assert.ok(skill.content.length > 500, `${skill.name} body is too thin to act on`)
    assert.equal(skill.source, 'runtime')
  }
})

test('descriptions are distinct so the catalog is not ambiguous', () => {
  const descriptions = skills.map((skill) => skill.description)
  assert.equal(new Set(descriptions).size, descriptions.length)
})

test('each skill names the tool it drives', () => {
  const expected = {
    'spec-write': 'pmf_check',
    'spec-close': 'pmf_evidence',
    'spec-sync': 'pmf_check',
    'spec-gc': 'pmf_expire',
  }
  for (const skill of skills) {
    assert.match(skill.content, new RegExp(expected[skill.name]), `${skill.name} should reference ${expected[skill.name]}`)
  }
})

test('the destructive skill requires explicit consent and a dry run first', () => {
  const gc = skills.find((skill) => skill.name === 'spec-gc')
  assert.match(gc.content, /dry run/i)
  assert.match(gc.content, /明确同意/)
  assert.match(gc.content, /不允许.*绕过|不绕过/s)
})
