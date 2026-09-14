import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Source contract: latest.json and update-latest-json.yml publish this package,
// stable channel, app-release.apk URL and unpadded base64url SHA-256 checksum.
// This validator never downloads artifacts or calls the publisher/Supabase.
export function validateManifest(manifest) {
  const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
  requireThat(manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest), 'Manifest must be an object');
  for (const key of ['appId','channel','versionName','apkUrl','sha256','provisioningChecksumBase64','releasedAt','notes']) {
    requireThat(typeof manifest[key] === 'string', `Missing or invalid string: ${key}`);
  }
  requireThat(manifest.appId === 'com.spekita.spekitasecure', 'Unexpected package');
  requireThat(manifest.channel === 'stable', 'Unexpected published channel');
  requireThat(/^[0-9][A-Za-z0-9._-]*$/.test(manifest.versionName), 'Invalid release version');
  for (const key of ['versionCode','minSupportedVersionCode']) {
    requireThat(Number.isSafeInteger(manifest[key]) && manifest[key] > 0, `Invalid positive version code: ${key}`);
  }
  requireThat(manifest.minSupportedVersionCode <= manifest.versionCode, 'Minimum supported version exceeds current version');
  requireThat(typeof manifest.forceUpdate === 'boolean', 'forceUpdate must be boolean');
  requireThat(Number.isInteger(manifest.rolloutPercent) && manifest.rolloutPercent >= 0 && manifest.rolloutPercent <= 100, 'Invalid rollout percentage');
  const url = new URL(manifest.apkUrl);
  requireThat(url.origin === 'https://github.com' && !url.username && !url.password && !url.search && !url.hash, 'Artifact URL is not an allowed GitHub HTTPS URL');
  const prefix = '/spekita-general-traders/SecureDevice-Releases/releases/download/';
  const parts = url.pathname.slice(prefix.length).split('/');
  requireThat(url.pathname.startsWith(prefix) && parts.length === 2 && parts[1] === 'app-release.apk', 'Artifact path is outside the canonical release repository');
  // The publisher strips an optional leading v from the actual release tag.
  requireThat(parts[0].replace(/^v/, '') === manifest.versionName, 'Release URL tag and versionName disagree');
  requireThat(/^[A-Fa-f0-9]{64}$/.test(manifest.sha256), 'Invalid SHA-256');
  requireThat(/^[A-Za-z0-9_-]{43}$/.test(manifest.provisioningChecksumBase64), 'Invalid unpadded base64url provisioning checksum');
  requireThat(Buffer.from(manifest.sha256, 'hex').toString('base64url') === manifest.provisioningChecksumBase64, 'Provisioning checksum does not encode the APK SHA-256');
  requireThat(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(manifest.releasedAt) &&
    Number.isFinite(Date.parse(manifest.releasedAt)) && new Date(manifest.releasedAt).toISOString().replace('.000Z','Z') === manifest.releasedAt,
    'releasedAt must be a valid UTC release timestamp');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync(new URL('../latest.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  validateManifest(manifest);
  console.log('PASS: checked-in release metadata contracts. Artifact existence, bytes and signing certificate are not tested; no network or publication.');
}
