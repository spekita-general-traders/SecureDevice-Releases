import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './validate-manifest.mjs';

export const REPO = 'spekita-general-traders/SecureDevice-Releases';
export const OWNER = 'spekita';
export const PROJECT = 'rfybyckzzvnaafpeclev';
export const SUPABASE_ORIGIN = 'https://' + PROJECT + '.supabase.co';
export const CHECK = 'Validate SecureDevice release manifest';
const API = 'https://api.github.com/repos/' + REPO;
const SHA = /^[a-f0-9]{40}$/;
const HEX = /^[a-f0-9]{64}$/;
const assert = (yes, message) => { if (!yes) throw new Error(message); };
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
export function validateTag(tag) {
  assert(typeof tag === 'string' && /^v?[0-9][A-Za-z0-9._-]*$/.test(tag), 'Invalid release tag');
  return tag;
}
export function validateProvisioning(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Invalid provisioning metadata');
  const value = {
    package_name: input.package_name ?? 'com.spekita.spekitasecure',
    component_name: input.component_name ?? 'com.spekita.spekitasecure/.MyDeviceAdminReceiver',
    signature_checksum_b64: input.signature_checksum_b64 ?? '',
    certificate_sha256_hex: input.certificate_sha256_hex ?? '',
  };
  assert(value.package_name === 'com.spekita.spekitasecure', 'Unexpected provisioning package');
  assert(value.component_name === 'com.spekita.spekitasecure/.MyDeviceAdminReceiver', 'Unexpected admin component');
  assert(typeof value.certificate_sha256_hex === 'string' && typeof value.signature_checksum_b64 === 'string', 'Invalid certificate metadata');
  if (value.certificate_sha256_hex || value.signature_checksum_b64) {
    assert(/^[a-fA-F0-9]{64}$/.test(value.certificate_sha256_hex), 'Invalid certificate SHA256');
    assert(Buffer.from(value.certificate_sha256_hex, 'hex').toString('base64url') === value.signature_checksum_b64, 'Certificate/signature checksum mismatch');
    value.certificate_sha256_hex = value.certificate_sha256_hex.toLowerCase();
  }
  return value;
}
export function releaseAssets(release, tag) {
  validateTag(tag);
  assert(release && Number.isSafeInteger(release.id) && release.id > 0 && release.tag_name === tag &&
    release.draft === false && release.prerelease === false && Array.isArray(release.assets), 'Expected an existing published stable release');
  assert(typeof release.published_at === 'string' && Number.isFinite(Date.parse(release.published_at)), 'Missing published timestamp');
  const find = name => {
    const found = release.assets.filter(a => a.name === name);
    assert(found.length === 1, 'Exactly one ' + name + ' asset is required');
    const a = found[0];
    const maximum = name === 'app-release.apk' ? 512 * 1024 * 1024 : 128 * 1024;
    assert(Number.isSafeInteger(a.id) && a.id > 0 && a.state === 'uploaded' &&
      Number.isSafeInteger(a.size) && a.size > 0 && a.size <= maximum, 'Invalid uploaded asset size/identity');
    assert(a.browser_download_url === 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name, 'Asset URL is not canonical');
    assert(a.digest == null || /^sha256:[a-f0-9]{64}$/.test(a.digest), 'Invalid GitHub asset digest');
    return { id: a.id, name, size: a.size, digest: a.digest ?? null, url: a.browser_download_url };
  };
  return { apk: find('app-release.apk'), provisioning: find('provisioning-metadata.json') };
}
export function prepareRecords(current, release, apkHash, metadataBytes, versionCode) {
  validateManifest(current);
  const tag = validateTag(release.tag_name);
  const assets = releaseAssets(release, tag);
  assert(HEX.test(apkHash), 'Invalid APK SHA256');
  assert(Buffer.byteLength(metadataBytes) === assets.provisioning.size, 'Provisioning asset size changed');
  const metadataHash = digest(metadataBytes);
  for (const [asset, hash] of [[assets.apk, apkHash], [assets.provisioning, metadataHash]]) {
    assert(!asset.digest || asset.digest === 'sha256:' + hash, 'GitHub asset digest mismatch');
  }
  assert(/^[1-9][0-9]*$/.test(String(versionCode)) && Number.isSafeInteger(Number(versionCode)), 'Actual positive Android versionCode is required');
  const raw = JSON.parse(metadataBytes.toString('utf8'));
  if (raw.version_code != null) assert(Number(raw.version_code) === Number(versionCode), 'Metadata/versionCode mismatch');
  const provisioning = validateProvisioning(raw);
  const latest = { ...current, versionName: tag.replace(/^v/, ''), versionCode: Number(versionCode),
    apkUrl: assets.apk.url, sha256: apkHash, provisioningChecksumBase64: Buffer.from(apkHash, 'hex').toString('base64url'),
    releasedAt: new Date(release.published_at).toISOString().replace('.000Z', 'Z') };
  validateManifest(latest);
  const record = { schema_version: 1, release_id: release.id, tag, published_at: latest.releasedAt,
    assets, apk_sha256: apkHash, provisioning_asset_sha256: metadataHash, provisioning };
  validateRecords(latest, record);
  return { latest, record };
}
export function validateRecords(latest, record) {
  validateManifest(latest);
  assert(record && record.schema_version === 1 && Number.isSafeInteger(record.release_id) && record.release_id > 0, 'Missing reviewed release record');
  validateTag(record.tag);
  const assets = releaseAssets({ id: record.release_id, tag_name: record.tag, published_at: record.published_at,
    draft: false, prerelease: false, assets: Object.values(record.assets ?? {}).map(a => ({
      ...a, browser_download_url: a.url, state: 'uploaded',
    })) }, record.tag);
  assert(record.tag.replace(/^v/, '') === latest.versionName && record.published_at === latest.releasedAt &&
    record.apk_sha256 === latest.sha256 && assets.apk.url === latest.apkUrl &&
    HEX.test(record.provisioning_asset_sha256), 'Reviewed manifest and release record disagree');
  assert(!assets.apk.digest || assets.apk.digest === 'sha256:' + latest.sha256, 'APK digest mismatch');
  assert(!assets.provisioning.digest || assets.provisioning.digest === 'sha256:' + record.provisioning_asset_sha256, 'Provisioning digest mismatch');
  assert(JSON.stringify(validateProvisioning(record.provisioning)) === JSON.stringify(record.provisioning), 'Provisioning record is not canonical');
  return true;
}
export function payload(latest, record) {
  validateRecords(latest, record);
  return { p_app_id: latest.appId, p_channel: latest.channel, p_tag: record.tag, p_version_name: latest.versionName,
    p_release_repo: REPO, p_apk_name: 'app-release.apk', p_apk_url: latest.apkUrl, p_sha256: latest.sha256,
    p_provisioning_checksum_base64: latest.provisioningChecksumBase64,
    p_signature_checksum_base64: record.provisioning.signature_checksum_b64,
    p_component_name: record.provisioning.component_name, p_package_name: record.provisioning.package_name,
    p_certificate_sha256_hex: record.provisioning.certificate_sha256_hex, p_released_at: latest.releasedAt };
}
export async function github(endpoint, options = {}, token = process.env.GH_TOKEN) {
  assert(token, 'GitHub token missing');
  const response = await fetch(API + endpoint, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (response.status === 404 && options.allow404) return null;
  assert(response.ok, 'GitHub request failed HTTP ' + response.status);
  try { return await response.json(); } catch { throw new Error('Invalid GitHub metadata response'); }
}
export async function downloadAsset(asset, fetchImpl = fetch) {
  let url = asset.url;
  let response;
  for (let hops = 0; hops <= 3; hops++) {
    const u = new URL(url);
    assert(u.protocol === 'https:' && !u.username && !u.password &&
      ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(u.hostname), 'Untrusted asset redirect');
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if (![301,302,303,307,308].includes(response.status)) break;
    await response.body?.cancel();
    assert(hops < 3 && response.headers.get('location'), 'Asset redirect limit');
    url = new URL(response.headers.get('location'), url).href;
  }
  assert(response?.status === 200 && response.body, 'Asset download failed');
  const hash = createHash('sha256'), chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    assert(size <= asset.size, 'Asset exceeded recorded size');
    hash.update(chunk);
    if (asset.name === 'provisioning-metadata.json') chunks.push(Buffer.from(chunk));
  }
  assert(size === asset.size, 'Asset was truncated');
  const sha256 = hash.digest('hex');
  assert(!asset.digest || asset.digest === 'sha256:' + sha256, 'Downloaded asset digest mismatch');
  return { sha256, bytes: chunks.length ? Buffer.concat(chunks) : null };
}
export async function mainGuard(env, checkout, workflow, get = github) {
  assert(env.GITHUB_REPOSITORY === REPO && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_ACTOR === OWNER && env.GITHUB_TRIGGERING_ACTOR === OWNER, 'Owner manual main dispatch required');
  assert(SHA.test(checkout) && env.GITHUB_SHA === checkout && env.GITHUB_WORKFLOW_SHA === checkout &&
    env.GITHUB_WORKFLOW_REF === REPO + '/.github/workflows/' + workflow + '@refs/heads/main', 'Canonical main workflow source required');
  const repo = await get('');
  assert(repo.full_name === REPO && repo.default_branch === 'main', 'Unexpected repository');
  const permission = await get('/collaborators/' + OWNER + '/permission');
  assert(permission.user?.login === OWNER && ['write','admin'].includes(permission.permission), 'Owner permission missing');
  assert((await get('/commits/main')).sha === checkout, 'Main moved; dispatch the current main again');
}
export function attestation(env, latest, record) {
  return 'PUBLISH PR#' + env.APPROVAL_PR + ' HEAD ' + env.APPROVED_HEAD_COMMIT + ' MERGE ' + env.REVIEWED_COMMIT +
    ' TAG ' + record.tag + ' SHA256 ' + latest.sha256;
}
export async function publishGuard(env, checkout, latest, record, get = github) {
  validateRecords(latest, record);
  await mainGuard(env, checkout, 'publish-reviewed-metadata.yml', get);
  assert(env.REVIEWED_COMMIT === checkout && SHA.test(env.APPROVED_HEAD_COMMIT) &&
    /^[1-9][0-9]*$/.test(env.APPROVAL_PR ?? '') && env.OWNER_ATTESTATION === attestation(env, latest, record), 'Exact publication owner attestation required');
  const pr = await get('/pulls/' + env.APPROVAL_PR);
  assert(pr.number === Number(env.APPROVAL_PR) && pr.state === 'closed' && pr.merged === true && pr.merged_by?.login === OWNER &&
    pr.base?.ref === 'main' && pr.base?.repo?.full_name === REPO && pr.head?.repo?.full_name === REPO &&
    pr.merge_commit_sha === checkout && pr.head?.sha === env.APPROVED_HEAD_COMMIT, 'Exact owner-merged canonical PR required');
  const files = await get('/pulls/' + env.APPROVAL_PR + '/files?per_page=100');
  assert(Array.isArray(files) && files.length === 2 &&
    files.map(f => f.filename).sort().join(',') === 'latest.json,release-metadata.json' &&
    files.every(f => ['added','modified'].includes(f.status)), 'Publish requires a metadata-only PR');
  for (const [name, value] of [['latest.json', latest], ['release-metadata.json', record]]) {
    const file = await get('/contents/' + name + '?ref=' + env.APPROVED_HEAD_COMMIT);
    assert(file.encoding === 'base64' && digest(Buffer.from(file.content, 'base64')) === digest(jsonBytes(value)), 'Reviewed head content differs from main');
  }
  // Enforce the fixed check directly; GITHUB_TOKEN does not need repository
  // administration permission to read or change branch protection.
  const checks = await get('/commits/' + env.APPROVED_HEAD_COMMIT + '/check-runs?filter=latest&per_page=100');
  assert(Array.isArray(checks.check_runs) && checks.total_count < 100, 'Incomplete required-check inventory');
  const matches = checks.check_runs.filter(c => c.name === CHECK && c.app?.id === 15368);
  assert(matches.length === 1, 'Required canonical check missing or ambiguous');
  const c = matches[0], prefix = 'https://github.com/' + REPO + '/actions/runs/';
  const match = typeof c.details_url === 'string' && c.details_url.startsWith(prefix) &&
    /^(\d+)\/job\/\d+$/.exec(c.details_url.slice(prefix.length));
  assert(c.head_sha === env.APPROVED_HEAD_COMMIT && c.status === 'completed' && c.conclusion === 'success' && match, 'Required check failed or wrong head');
  const run = await get('/actions/runs/' + match[1]);
  assert(run.id === Number(match[1]) && run.event === 'pull_request' && run.path === '.github/workflows/manifest-validation.yml' &&
    run.head_sha === env.APPROVED_HEAD_COMMIT && run.status === 'completed' && run.conclusion === 'success' &&
    run.repository?.full_name === REPO && run.head_repository?.full_name === REPO &&
    run.check_suite_id === c.check_suite?.id && Array.isArray(run.pull_requests), 'CI workflow/PR association mismatch');
  if (run.pull_requests.length > 0) {
    assert(run.pull_requests.some(p => p.number === pr.number && p.head?.sha === env.APPROVED_HEAD_COMMIT &&
      p.base?.ref === 'main'), 'CI run names a different PR');
  } else {
    // GitHub may omit run associations after merge. Use its exact head-commit
    // association only for an empty list; never override a conflicting list.
    assert(typeof pr.head.ref === 'string' && pr.head.ref.length > 0 && run.head_branch === pr.head.ref,
      'Empty CI association requires the exact source branch');
    const associations = await get('/commits/' + env.APPROVED_HEAD_COMMIT + '/pulls?per_page=100');
    assert(Array.isArray(associations) && associations.length < 100, 'Incomplete merged PR association inventory');
    const matching = associations.filter(p => p.number === pr.number && p.state === 'closed' && p.merged_at &&
      p.merge_commit_sha === checkout && p.head?.sha === env.APPROVED_HEAD_COMMIT && p.head?.ref === pr.head.ref &&
      p.head?.repo?.full_name === REPO && p.base?.ref === 'main' && p.base?.repo?.full_name === REPO);
    assert(matching.length === 1, 'Exact merged PR association missing or ambiguous');
  }
  assert((await get('/commits/main')).sha === checkout, 'Main advanced during verification');
}
export async function verifyAssets(latest, record, get = github, download = downloadAsset) {
  const release = await get('/releases/tags/' + validateTag(record.tag));
  const assets = releaseAssets(release, record.tag);
  assert(release.id === record.release_id && new Date(release.published_at).toISOString().replace('.000Z','Z') === record.published_at &&
    JSON.stringify(assets) === JSON.stringify(record.assets), 'Release identity/assets changed after review');
  const apk = await download(assets.apk), metadata = await download(assets.provisioning);
  const raw = JSON.parse(metadata.bytes.toString('utf8'));
  if (raw.version_code != null) assert(Number(raw.version_code) === latest.versionCode, 'Reviewed versionCode differs from the release metadata');
  assert(apk.sha256 === latest.sha256 && metadata.sha256 === record.provisioning_asset_sha256 &&
    JSON.stringify(validateProvisioning(raw)) === JSON.stringify(record.provisioning),
    'Release bytes or provisioning metadata changed after review');
}
export function secretHeaders(origin, key) {
  assert(origin === SUPABASE_ORIGIN, 'Supabase destination must match the fixed production project');
  assert(typeof key === 'string' && key.length < 10000, 'Server key missing');
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return headers;
  assert(/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key), 'Invalid or masked server key');
  let claims; try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch { throw new Error('Invalid legacy server key'); }
  assert(claims.role === 'service_role' && claims.ref === PROJECT, 'Legacy key role/project mismatch');
  headers.Authorization = 'Bearer ' + key;
  return headers;
}
export async function publishSupabase(latest, record, origin, key, fetchImpl = fetch) {
  const body = payload(latest, record), headers = secretHeaders(origin, key);
  const response = await fetchImpl(origin + '/rest/v1/rpc/upsert_secure_app_release', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers, body: JSON.stringify(body) });
  assert(response.ok, 'Supabase publication failed HTTP ' + response.status);
  await response.body?.cancel();
  const select = 'app_id,channel,tag,version_name,release_repo,apk_name,apk_url,sha256,provisioning_checksum_base64,signature_checksum_base64,component_name,package_name,certificate_sha256_hex,released_at,is_latest,is_active';
  const url = origin + '/rest/v1/secure_app_releases?app_id=eq.' + latest.appId + '&channel=eq.stable&is_latest=eq.true&is_active=eq.true&select=' + select;
  const readback = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers });
  assert(readback.ok, 'Publication sent but readback failed; inspect state before retry');
  let rows; try { rows = await readback.json(); } catch { throw new Error('Publication sent but readback invalid'); }
  assert(Array.isArray(rows) && rows.length === 1, 'Publication sent but latest-row readback is ambiguous');
  for (const [name, expected] of Object.entries(body)) {
    const value = rows[0][name.slice(2)];
    assert(name === 'p_released_at' ? Date.parse(value) === Date.parse(expected) : (value ?? '') === expected, 'Publication sent but metadata readback differs');
  }
  assert(rows[0].is_latest === true && rows[0].is_active === true, 'Publication sent but active/latest flags differ');
}
async function prepare(env, checkout) {
  await mainGuard(env, checkout, 'update-latest-json.yml');
  const tag = validateTag(env.RELEASE_TAG);
  const release = await github('/releases/tags/' + tag);
  const assets = releaseAssets(release, tag);
  const apk = await downloadAsset(assets.apk), metadata = await downloadAsset(assets.provisioning);
  const current = JSON.parse(fs.readFileSync('latest.json', 'utf8'));
  const { latest, record } = prepareRecords(current, release, apk.sha256, metadata.bytes, env.VERSION_CODE);
  return createMetadataPR(checkout, latest, record);
}
export async function createMetadataPR(checkout, latest, record, request = github) {
  validateRecords(latest, record);
  assert(SHA.test(checkout), 'Invalid main SHA');
  const tag = record.tag;
  const branch = 'release/metadata-' + record.release_id + '-' + digest(Buffer.concat([jsonBytes(latest), jsonBytes(record)])).slice(0,16);
  const blobs = [];
  for (const [name, value] of [['latest.json',latest],['release-metadata.json',record]]) {
    const blob = await request('/git/blobs', { method:'POST', body:JSON.stringify({content:jsonBytes(value).toString('base64'),encoding:'base64'}) });
    blobs.push({ path:name,mode:'100644',type:'blob',sha:blob.sha });
  }
  assert((await request('/commits/main')).sha === checkout, 'Main moved before branch preparation');
  const baseCommit = await request('/git/commits/' + checkout);
  const tree = await request('/git/trees', {method:'POST',body:JSON.stringify({base_tree:baseCommit.tree.sha,tree:blobs})});
  const person = { name:'github-actions[bot]',email:'41898282+github-actions[bot]@users.noreply.github.com',date:record.published_at };
  const commit = await request('/git/commits', {method:'POST',body:JSON.stringify({message:'Prepare SecureDevice metadata '+tag,tree:tree.sha,parents:[checkout],author:person,committer:person})});
  const existing = await request('/git/ref/heads/' + branch, {allow404:true});
  if (existing) assert(existing.object?.sha === commit.sha, 'Existing preparation branch changed; inspect its PR');
  else await request('/git/refs',{method:'POST',body:JSON.stringify({ref:'refs/heads/'+branch,sha:commit.sha})});
  const prs = await request('/pulls?state=open&base=main&head=spekita-general-traders:' + branch + '&per_page=100');
  assert(Array.isArray(prs) && prs.length < 100, 'Incomplete existing-PR inventory');
  if (prs.length) {
    assert(prs.length === 1 && prs[0].head?.sha === commit.sha, 'Existing metadata PR is ambiguous');
    return prs[0].html_url;
  } else {
    const pr = await request('/pulls',{method:'POST',body:JSON.stringify({title:'Prepare SecureDevice metadata '+tag,head:branch,base:'main',
      body:'Prepared from existing public release assets. Review latest.json and release-metadata.json, actual Android versionCode, APK SHA256 and signing identity. No Supabase publication has occurred. Approve workflows to run if GitHub requests it; wait for the required manifest CI, then merge through branch protection. Publication is a separate owner-attested manual main workflow.'})});
    return pr.html_url;
  }
}
async function cli() {
  const mode = process.argv[2], env = process.env;
  if (mode === 'validate') {
    if (fs.existsSync('release-metadata.json')) validateRecords(JSON.parse(fs.readFileSync('latest.json','utf8')),JSON.parse(fs.readFileSync('release-metadata.json','utf8')));
    console.log('PASS: reviewed release records when present; no network or publication.');
    return;
  }
  assert(['prepare','guard','verify-assets','publish'].includes(mode), 'Unknown release mode');
  const checkout = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if (mode === 'prepare') { console.log('Prepared metadata PR: ' + await prepare(env,checkout)); return; }
  const latest = JSON.parse(fs.readFileSync('latest.json','utf8')), record = JSON.parse(fs.readFileSync('release-metadata.json','utf8'));
  await publishGuard(env,checkout,latest,record);
  if (mode === 'verify-assets' || mode === 'publish') await verifyAssets(latest,record);
  if (mode === 'publish') {
    assert((await github('/commits/main')).sha === checkout, 'Main moved immediately before publication');
    await publishSupabase(latest,record,env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
    console.log('PASS: reviewed metadata published and latest-row readback matched.');
  } else console.log('PASS: publication '+mode+'; no Supabase write.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(() => { console.error('Release operation failed. Inspect exact source, owner, public metadata, permissions and validation; no raw response or credentials logged. Do not blindly retry a publication.'); process.exitCode = 1; });
}
