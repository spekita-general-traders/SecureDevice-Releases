import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Git/bin/bash.exe')
  : 'bash';
const script = fileURLToPath(new URL('./validate-release-tag.sh', import.meta.url)).replaceAll('\\', '/');
function check(...args) {
  // Args are literal argv entries, not a shell command. Only the tiny validation
  // script runs; no publisher, release payload, gh, curl, APK or network call.
  return spawnSync(bash, [script, ...args], {
    shell: false, encoding: 'utf8', timeout: 5000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? '', BASH_ENV: '' },
  });
}
for (const value of ['v1.0.19', '1.0.19', 'v1.0.268-adb-pilot', 'v1.1.20260825.2314']) {
  test(`allow version tag ${value}`, () => {
    const result = check(value);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}
for (const [label, value] of [
  ['empty', ''], ['wrong version form', 'beta'], ['path separator', 'v1.0/other'],
  ['backslash', 'v1.0\\other'], ['query', 'v1.0?download=1'], ['percent escape', 'v1%2fother'],
  ['space', 'v1.0 other'], ['newline', 'v1.0\nOTHER=value'], ['option', '--help'],
  ['quote breakout', 'v1.0"; printf NOT_EXECUTED; #'],
  ['command substitution', 'v1.0$(printf NOT_EXECUTED)'],
  ['backtick substitution', 'v1.0`printf NOT_EXECUTED`'],
]) {
  test(`reject unsafe tag: ${label}`, () => {
    const result = check(value);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Invalid release tag');
  });
}
test('reject missing and extra arguments', () => {
  for (const args of [[], ['v1.0', 'extra']]) assert.equal(check(...args).status, 1);
});
test('publisher receives event tag only through env and validates before URL construction', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/update-latest-json.yml', import.meta.url), 'utf8');
  const eventLines = workflow.split(/\r?\n/).filter(line => line.includes('github.event.release.tag_name'));
  assert.equal(eventLines.length, 1);
  assert.match(eventLines[0], /^\s+RELEASE_TAG: \$\{\{ github\.event\.release\.tag_name \}\}$/);
  const guard = workflow.indexOf('bash scripts/validate-release-tag.sh "$TAG_NAME"');
  assert.ok(guard > workflow.indexOf('TAG_NAME="${RELEASE_TAG:-}"'));
  assert.ok(guard < workflow.indexOf('APK_URL='));
});
