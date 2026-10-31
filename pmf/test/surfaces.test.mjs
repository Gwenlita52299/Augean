import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { installHooks, MARKER, uninstallHooks } from '../adapters/git-hooks.js'
import { check } from '../lib/api.js'
import { CORE_VERSION, SCHEMA_VERSION, satisfies } from '../lib/version.js'

const BIN = fileURLToPath(new URL('../bin/pmf.mjs', import.meta.url))

function write(root, rel, text) {
  const abs = join(root, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, text)
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'pmf-surf-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'pmf@test.invalid')
  git(root, 'config', 'user.name', 'pmf test')
  git(root, 'config', 'commit.gpgsign', 'false')
  return root
}

function note(id, { owner = 'fairy' } = {}) {
  return `---\ndoc_kind: note\nid: ${id}\nstatus: active\ncreated: 2026-10-01\nupdated: 2026-10-02\n${owner ? `owner: ${owner}\n` : ''}---\n\n# ${id}\n`
}

function cli(root, ...args) {
  return spawnSync(process.execPath, [BIN, ...args, '--root', root], { encoding: 'utf8' })
}

test('changed-only reports only staged files, full check still sees everything', () => {
  const root = repo()
  write(root, 'docs/notes/2026-10-old.md', note('N-OLD', { owner: null }))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'legacy debt')
  write(root, 'docs/notes/2026-10-fresh.md', note('N-FRESH', { owner: null }))
  git(root, 'add', 'docs/notes/2026-10-fresh.md')

  const full = check(root)
  assert.equal(full.errors.length, 2)

  const staged = check(root, { changedOnly: true })
  assert.equal(staged.changed, 1)
  assert.deepEqual(staged.errors.map((item) => item.file), ['notes/2026-10-fresh.md'])
})

test('changed-only keeps whole-set rules: a staged duplicate id is still caught', () => {
  const root = repo()
  write(root, 'docs/notes/2026-10-a.md', note('N-1'))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'a')
  write(root, 'docs/notes/2026-10-b.md', note('N-1'))
  git(root, 'add', '.')
  const result = check(root, { changedOnly: true })
  assert.deepEqual(result.errors.map((item) => [item.code, item.file]), [['ID_DUP', 'notes/2026-10-b.md']])
})

test('changed-only with since compares a ref range instead of the index', () => {
  const root = repo()
  write(root, 'docs/notes/2026-10-a.md', note('N-A'))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'a')
  const base = git(root, 'rev-parse', 'HEAD').trim()
  write(root, 'docs/notes/2026-10-b.md', note('N-B', { owner: null }))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'b')
  const result = check(root, { changedOnly: true, since: base })
  assert.equal(result.changed, 1)
  assert.deepEqual(result.errors.map((item) => item.file), ['notes/2026-10-b.md'])
})

test('changed-only outside git fails loudly instead of passing an empty set', () => {
  const root = mkdtempSync(join(tmpdir(), 'pmf-nogit-'))
  write(root, 'docs/notes/2026-10-a.md', note('N-A'))
  assert.throws(() => check(root, { changedOnly: true }), /needs a git work tree/)
  const run = cli(root, 'check', '--changed-only')
  assert.equal(run.status, 1)
})

test('requires: a core version outside the range is an error, inside passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'pmf-req-'))
  write(root, 'docs/notes/2026-10-a.md', note('N-A'))
  write(root, 'pmf.config.json', JSON.stringify({ requires: '^99.0' }))
  const bad = check(root)
  assert.equal(bad.ok, false)
  assert.equal(bad.errors[0].code, 'CORE_VERSION')

  write(root, 'pmf.config.json', JSON.stringify({ requires: `^${CORE_VERSION}` }))
  assert.equal(check(root).ok, true)
})

test('satisfies follows npm caret semantics for 0.x', () => {
  assert.equal(satisfies('0.2.3', '^0.2').ok, true)
  assert.equal(satisfies('0.3.0', '^0.2').ok, false)
  assert.equal(satisfies('1.4.0', '^1.2').ok, true)
  assert.equal(satisfies('2.0.0', '^1.2').ok, false)
  assert.equal(satisfies('0.2.0', '0.2.0').ok, true)
  assert.equal(satisfies('0.2.0', '>=0.2').ok, false)
})

test('every --json payload is an object with schema_version', () => {
  const root = mkdtempSync(join(tmpdir(), 'pmf-json-'))
  write(root, 'docs/notes/2026-10-a.md', note('N-A'))
  for (const args of [['check'], ['evidence'], ['retention'], ['expire'], ['index'], ['version']]) {
    const run = cli(root, ...args, '--json')
    const payload = JSON.parse(run.stdout)
    assert.equal(Array.isArray(payload), false, args.join(' '))
    assert.equal(payload.schema_version, SCHEMA_VERSION, args.join(' '))
    assert.equal(payload.command, args[0])
  }
})

test('hooks install writes executable marked hooks and the pre-commit hook blocks a bad staged doc', () => {
  const root = repo()
  write(root, 'docs/notes/2026-10-a.md', note('N-A'))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'a')

  const result = installHooks(root)
  assert.deepEqual(result.installed.sort(), ['pre-commit', 'pre-push'])
  const hook = join(result.hooksDir, 'pre-commit')
  assert.ok(readFileSync(hook, 'utf8').includes(MARKER))
  assert.ok(statSync(hook).mode & 0o100)

  write(root, 'docs/notes/2026-10-b.md', note('N-B', { owner: null }))
  git(root, 'add', '.')
  const blocked = spawnSync('git', ['-C', root, 'commit', '-qm', 'b'], { encoding: 'utf8' })
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stdout + blocked.stderr, /FM_REQUIRED/)

  write(root, 'docs/notes/2026-10-b.md', note('N-B'))
  git(root, 'add', '.')
  const passed = spawnSync('git', ['-C', root, 'commit', '-qm', 'b'], { encoding: 'utf8' })
  assert.equal(passed.status, 0, passed.stderr)
})

test('hooks install never overwrites a foreign hook without force; uninstall removes only its own', () => {
  const root = repo()
  const hooksDir = join(root, '.git', 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  writeFileSync(join(hooksDir, 'pre-commit'), '#!/bin/sh\necho mine\n')

  const first = installHooks(root)
  assert.deepEqual(first.installed, ['pre-push'])
  assert.equal(first.skipped[0].hook, 'pre-commit')
  assert.equal(readFileSync(join(hooksDir, 'pre-commit'), 'utf8'), '#!/bin/sh\necho mine\n')

  const removed = uninstallHooks(root)
  assert.deepEqual(removed.removed, ['pre-push'])
  assert.ok(existsSync(join(hooksDir, 'pre-commit')))

  const forced = installHooks(root, { force: true })
  assert.ok(forced.installed.includes('pre-commit'))
})

test('hooks installed from a subdirectory project run against that subdirectory', () => {
  const root = repo()
  const sub = join(root, 'packages', 'app')
  write(sub, 'docs/notes/2026-10-a.md', note('N-A'))
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'a')
  installHooks(sub)
  write(sub, 'docs/notes/2026-10-b.md', note('N-B', { owner: null }))
  git(root, 'add', '.')
  const blocked = spawnSync('git', ['-C', root, 'commit', '-qm', 'b'], { encoding: 'utf8' })
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stdout + blocked.stderr, /notes\/2026-10-b\.md/)
})
