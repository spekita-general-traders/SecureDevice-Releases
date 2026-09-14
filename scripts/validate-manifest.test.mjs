import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validateManifest } from './validate-manifest.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../latest.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
test('actual checked-in release manifest is internally consistent', () => assert.equal(validateManifest(fixture), true));
for (const [name, mutate] of [
  ['download moved to another origin', m => { m.apkUrl = m.apkUrl.replace('github.com','example.invalid'); }],
  ['download moved to another repository', m => { m.apkUrl = m.apkUrl.replace('/SecureDevice-Releases/','/Other/'); }],
  ['credential-bearing URL', m => { m.apkUrl = m.apkUrl.replace('https://','https://synthetic@'); }],
  ['query injected into artifact URL', m => { m.apkUrl += '?redirect=elsewhere'; }],
  ['URL points to another release', m => { m.apkUrl = m.apkUrl.replace(`/v${m.versionName}/`, `/v${m.versionName}-different/`); }],
  ['different package', m => { m.appId = 'com.other.app'; }],
  ['different channel', m => { m.channel = 'beta'; }],
  ['checksum copied from different APK', m => { m.sha256 = '0'.repeat(64); }],
  ['base64 checksum accidentally padded', m => { m.provisioningChecksumBase64 += '='; }],
  ['invalid SHA-256 encoding', m => { m.sha256 = 'invalid'; }],
  ['string boolean from templating', m => { m.forceUpdate = 'false'; }],
  ['rollout outside percentage range', m => { m.rolloutPercent = 101; }],
  ['unsupported minimum version', m => { m.minSupportedVersionCode = m.versionCode + 1; }],
  ['impossible release date', m => { m.releasedAt = '2026-02-31T00:00:00Z'; }],
]) {
  test(`reject ${name}`, () => {
    const value = structuredClone(fixture);
    mutate(value);
    assert.throws(() => validateManifest(value));
  });
}
test('publisher allows a tag without its optional v prefix', () => {
  const value = structuredClone(fixture);
  value.apkUrl = value.apkUrl.replace(`/v${value.versionName}/`, `/${value.versionName}/`);
  assert.equal(validateManifest(value), true);
});
