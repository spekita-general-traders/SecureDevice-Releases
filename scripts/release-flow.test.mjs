import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REPO,OWNER,CHECK,PROJECT,SUPABASE_ORIGIN,digest,validateTag,validateProvisioning,releaseAssets,prepareRecords,
validateRecords,payload,downloadAsset,publishGuard,attestation,verifyAssets,secretHeaders,publishSupabase,createMetadataPR} from './release-flow.mjs';
const baseline=JSON.parse(fs.readFileSync(new URL('../latest.json',import.meta.url),'utf8'));
// Synthetic rollout values stay stable when a future real manifest raises its
// version/minimum. The separate manifest tests validate the actual file.
baseline.versionCode=1;baseline.minSupportedVersionCode=1;
const HEAD='1'.repeat(40),MERGE='2'.repeat(40),APK='b'.repeat(64),CERT='a'.repeat(64);
const provisioning={package_name:'com.spekita.spekitasecure',component_name:'com.spekita.spekitasecure/.MyDeviceAdminReceiver',
signature_checksum_b64:Buffer.from(CERT,'hex').toString('base64url'),certificate_sha256_hex:CERT};
const bytes=Buffer.from(JSON.stringify(provisioning));
const release={id:42,tag_name:'v1.0.20',draft:false,prerelease:false,published_at:'2026-09-01T00:00:00Z',assets:[
{id:100,name:'app-release.apk',size:3,digest:'sha256:'+APK,state:'uploaded',browser_download_url:'https://github.com/'+REPO+'/releases/download/v1.0.20/app-release.apk'},
{id:101,name:'provisioning-metadata.json',size:bytes.length,digest:'sha256:'+digest(bytes),state:'uploaded',browser_download_url:'https://github.com/'+REPO+'/releases/download/v1.0.20/provisioning-metadata.json'}]};
const {latest,record}=prepareRecords(baseline,release,APK,bytes,'20');
const jsonBytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const checkPath='/commits/'+HEAD+'/check-runs?filter=latest&per_page=100';
function fixture(){
const env={GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:OWNER,
GITHUB_TRIGGERING_ACTOR:OWNER,GITHUB_SHA:MERGE,GITHUB_WORKFLOW_SHA:MERGE,GITHUB_WORKFLOW_REF:REPO+'/.github/workflows/publish-reviewed-metadata.yml@refs/heads/main',
APPROVAL_PR:'8',APPROVED_HEAD_COMMIT:HEAD,REVIEWED_COMMIT:MERGE};
env.OWNER_ATTESTATION=attestation(env,latest,record);
const objects={
'':{full_name:REPO,default_branch:'main'},
['/collaborators/'+OWNER+'/permission']:{user:{login:OWNER},permission:'admin'},'/commits/main':{sha:MERGE},
'/pulls/8':{state:'closed',merged:true,merged_by:{login:OWNER},base:{ref:'main',repo:{full_name:REPO}},head:{sha:HEAD,repo:{full_name:REPO}},merge_commit_sha:MERGE},
'/pulls/8/files?per_page=100':[{filename:'latest.json',status:'modified'},{filename:'release-metadata.json',status:'added'}],
['/contents/latest.json?ref='+HEAD]:{encoding:'base64',content:jsonBytes(latest).toString('base64')},
['/contents/release-metadata.json?ref='+HEAD]:{encoding:'base64',content:jsonBytes(record).toString('base64')},
[checkPath]:{total_count:1,check_runs:[{id:700,name:CHECK,app:{id:15368},head_sha:HEAD,status:'completed',conclusion:'success',details_url:'https://github.com/'+REPO+'/actions/runs/900/job/700',check_suite:{id:80}}]},
'/actions/runs/900':{id:900,event:'pull_request',path:'.github/workflows/manifest-validation.yml',head_sha:HEAD,status:'completed',conclusion:'success',
repository:{full_name:REPO},head_repository:{full_name:REPO},check_suite_id:80,pull_requests:[{number:8,head:{sha:HEAD},base:{ref:'main'}}]}};
const calls=[],get=async p=>{calls.push(p);assert.ok(Object.hasOwn(objects,p),'Unexpected API '+p);return structuredClone(objects[p]);};
return{env,objects,get,calls};}
test('prepare preserves rollout controls and uses actual versionCode/published date',()=>{
assert.equal(latest.versionCode,20);assert.equal(latest.versionName,'1.0.20');assert.equal(latest.releasedAt,release.published_at);
assert.equal(latest.forceUpdate,baseline.forceUpdate);assert.equal(latest.rolloutPercent,baseline.rolloutPercent);
assert.equal(validateRecords(latest,record),true);assert.equal(payload(latest,record).p_certificate_sha256_hex,CERT);});
test('only public allowlisted provisioning fields are copied',()=>{
const raw=Buffer.from(JSON.stringify({...provisioning,extra:'DO_NOT_COPY'})),r=structuredClone(release);
r.assets[1].size=raw.length;r.assets[1].digest='sha256:'+digest(raw);
assert.ok(!JSON.stringify(prepareRecords(baseline,r,APK,raw,'20')).includes('DO_NOT_COPY'));});
for(const [label,change]of[
['wrong package',m=>m.package_name='other.app'],['wrong component',m=>m.component_name+='Other'],
['cert mismatch',m=>m.certificate_sha256_hex='c'.repeat(64)],['newline',m=>m.signature_checksum_b64+='\nKEY=value']
])test('reject provisioning '+label,()=>{const m=structuredClone(provisioning);change(m);assert.throws(()=>validateProvisioning(m));});
test('legacy empty certificate pair is preserved explicitly',()=>assert.equal(validateProvisioning({}).signature_checksum_b64,''));
for(const [label,change]of[
['draft',r=>r.draft=true],['prerelease',r=>r.prerelease=true],['other app tag',r=>r.tag_name='SpekitaAgent-v1'],
['missing asset',r=>r.assets.pop()],['duplicate asset',r=>r.assets.push(r.assets[0])],
['wrong URL',r=>r.assets[0].browser_download_url='https://example.invalid/apk'],
['oversize',r=>r.assets[1].size=1024*1024],['invalid digest',r=>r.assets[0].digest='sha256:no']
])test('reject release '+label,()=>{const r=structuredClone(release);change(r);assert.throws(()=>releaseAssets(r,'v1.0.20'));});
test('reject actual digest mismatch and invalid versionCode',()=>{
assert.throws(()=>prepareRecords(baseline,release,'c'.repeat(64),bytes,'20'));
for(const code of['0','-1','1.2','2\nX=Y','9007199254740993'])assert.throws(()=>prepareRecords(baseline,release,APK,bytes,code));});
test('reject record drift',()=>{for(const change of[r=>r.apk_sha256='d'.repeat(64),r=>r.tag='v1.0.21',r=>r.assets.apk.id=0]){
const r=structuredClone(record);change(r);assert.throws(()=>validateRecords(latest,r));}});
for(const tag of['v1$(echo NEVER)','v1'+String.fromCharCode(96)+'echo NEVER'+String.fromCharCode(96),'v1\nVAR=x','../v1','SpekitaAgent-v1'])
test('JS rejects unsafe literal tag',()=>assert.throws(()=>validateTag(tag)));
test('canonical owner-merged publication gate passes using read-only metadata',async()=>{
const f=fixture();await publishGuard(f.env,MERGE,latest,record,f.get);assert.ok(f.calls.every(p=>!p.includes('protection')));});
for(const[label,change]of[
['wrong actor',f=>f.env.GITHUB_ACTOR='spekita1'],['wrong rerun actor',f=>f.env.GITHUB_TRIGGERING_ACTOR='other'],
['release event',f=>f.env.GITHUB_EVENT_NAME='release'],['feature ref',f=>f.env.GITHUB_REF='refs/heads/feature'],
['workflow SHA',f=>f.env.GITHUB_WORKFLOW_SHA=HEAD],['workflow identity',f=>f.env.GITHUB_WORKFLOW_REF='other/workflow'],
['no attestation',f=>delete f.env.OWNER_ATTESTATION],['wrong merge input',f=>f.env.REVIEWED_COMMIT=HEAD],
['permission gone',f=>f.objects['/collaborators/'+OWNER+'/permission'].permission='read'],
['not merged',f=>f.objects['/pulls/8'].merged=false],['wrong merger',f=>f.objects['/pulls/8'].merged_by.login='spekita1'],
['foreign PR',f=>f.objects['/pulls/8'].head.repo.full_name='other/repo'],
['mixed workflow change',f=>f.objects['/pulls/8/files?per_page=100'].push({filename:'.github/workflows/publish-reviewed-metadata.yml',status:'modified'})],
['different reviewed contents',f=>f.objects['/contents/latest.json?ref='+HEAD].content=Buffer.from('{}').toString('base64')],
['wrong app',f=>f.objects[checkPath].check_runs[0].app.id=42],['failed CI',f=>f.objects[checkPath].check_runs[0].conclusion='failure'],
['incomplete checks',f=>f.objects[checkPath].total_count=100],['wrong check head',f=>f.objects[checkPath].check_runs[0].head_sha=MERGE],
['spoofed URL',f=>f.objects[checkPath].check_runs[0].details_url='https://example.invalid/actions/runs/900/job/700'],
['wrong CI workflow',f=>f.objects['/actions/runs/900'].path='.github/workflows/other.yml'],
['manual CI',f=>f.objects['/actions/runs/900'].event='workflow_dispatch'],
['wrong PR association',f=>f.objects['/actions/runs/900'].pull_requests[0].number=9],['main advanced',f=>f.objects['/commits/main'].sha=HEAD]
])test('deny publish '+label,async()=>{const f=fixture();change(f);await assert.rejects(publishGuard(f.env,MERGE,latest,record,f.get));});
test('download hashes exact bytes with no authenticated headers',async()=>{
const raw=Buffer.from('APK'),asset={name:'app-release.apk',url:release.assets[0].browser_download_url,size:3,digest:'sha256:'+digest(raw)};
const got=await downloadAsset(asset,async(u,o)=>{assert.equal(o.redirect,'manual');assert.equal(o.headers,undefined);return new Response(raw);});
assert.equal(got.sha256,digest(raw));assert.equal(got.bytes,null);});
test('external asset redirect blocked before following',async()=>{
let calls=0;await assert.rejects(downloadAsset({name:'app-release.apk',url:release.assets[0].browser_download_url,size:3},async()=>{
calls++;return new Response('',{status:302,headers:{Location:'https://example.invalid/apk'}});}));assert.equal(calls,1);});
test('truncated/oversized streams fail',async()=>{for(const raw of['AB','ABCD'])await assert.rejects(downloadAsset(
{name:'app-release.apk',url:release.assets[0].browser_download_url,size:3},async()=>new Response(raw)));});
test('prepublish asset identity and bytes rechecked',async()=>{
const get=async()=>structuredClone(release),download=async a=>a.name==='app-release.apk'?{sha256:APK}:{sha256:digest(bytes),bytes};
await verifyAssets(latest,record,get,download);const changed=structuredClone(release);changed.assets[0].id++;
await assert.rejects(verifyAssets(latest,record,async()=>changed,download));
await assert.rejects(verifyAssets(latest,record,get,async a=>a.name==='app-release.apk'?{sha256:'c'.repeat(64)}:download(a)));});
test('modern keys require fixed origin and reject Unicode masks',()=>{
assert.ok(!secretHeaders(SUPABASE_ORIGIN,'sb_secret_'+'A'.repeat(30)).Authorization);
for(const key of['sb_secret_'+'·'.repeat(26),'sb_publishable_'+'A'.repeat(30),'',undefined])assert.throws(()=>secretHeaders(SUPABASE_ORIGIN,key));
assert.throws(()=>secretHeaders('https://example.invalid','sb_secret_'+'A'.repeat(30)));});
test('publication rejects reviewed versionCode differing from the same hashed metadata',async()=>{
const raw=Buffer.from(JSON.stringify({...provisioning,version_code:20})),r=structuredClone(release);
r.assets[1].size=raw.length;r.assets[1].digest='sha256:'+digest(raw);
const p=prepareRecords(baseline,r,APK,raw,'20');p.latest.versionCode=21;
await assert.rejects(verifyAssets(p.latest,p.record,async()=>r,async a=>a.name==='app-release.apk'?{sha256:APK}:{sha256:digest(raw),bytes:raw}),/versionCode differs/);
});
test('legacy keys require exact service role/project',()=>{
const jwt=c=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';
assert.ok(secretHeaders(SUPABASE_ORIGIN,jwt({role:'service_role',ref:PROJECT})).Authorization);
for(const c of[{role:'anon',ref:PROJECT},{role:'service_role',ref:'other'}])assert.throws(()=>secretHeaders(SUPABASE_ORIGIN,jwt(c)));});
test('one no-redirect RPC followed by exact metadata readback',async()=>{
const calls=[],row=Object.fromEntries(Object.entries(payload(latest,record)).map(([k,v])=>[k.slice(2),v]));row.is_latest=true;row.is_active=true;
await publishSupabase(latest,record,SUPABASE_ORIGIN,'sb_secret_'+'A'.repeat(30),async(u,o)=>{
calls.push({u,o});assert.equal(o.redirect,'error');return calls.length===1?new Response(null,{status:204}):Response.json([row]);});
assert.equal(calls.length,2);assert.equal(calls[0].o.method,'POST');assert.equal(calls[1].o.method,'GET');
assert.deepEqual(JSON.parse(calls[0].o.body),payload(latest,record));});
test('failed RPC is not retried or reported as success',async()=>{for(const status of[302,401,403,429,500]){
let n=0;await assert.rejects(publishSupabase(latest,record,SUPABASE_ORIGIN,'sb_secret_'+'A'.repeat(30),async()=>{n++;return new Response(null,{status});}));assert.equal(n,1);}});
test('readback mismatch reports post-write failure',async()=>{
let n=0;await assert.rejects(publishSupabase(latest,record,SUPABASE_ORIGIN,'sb_secret_'+'A'.repeat(30),async()=>++n===1?new Response(null,{status:204}):Response.json([])),/Publication sent/);assert.equal(n,2);});
function prepareAPI(conflict=false){
const calls=[],request=async(p,o={})=>{
calls.push({p,o});if(p==='/git/blobs')return{sha:HEAD};if(p==='/commits/main')return{sha:MERGE};
if(p==='/git/commits/'+MERGE)return{tree:{sha:HEAD}};
if(p==='/git/trees'){assert.deepEqual(JSON.parse(o.body).tree.map(x=>x.path),['latest.json','release-metadata.json']);return{sha:HEAD};}
if(p==='/git/commits')return{sha:HEAD};if(p.startsWith('/git/ref/heads/release/metadata-'))return conflict?{object:{sha:MERGE}}:null;
if(p==='/git/refs'){assert.match(JSON.parse(o.body).ref,/^refs\/heads\/release\/metadata-/);return{};}
if(p.startsWith('/pulls?'))return[];
if(p==='/pulls'){assert.equal(JSON.parse(o.body).base,'main');return{html_url:'https://github.com/'+REPO+'/pull/8'};}
throw Error('Unexpected operation '+p);};return{calls,request};}
test('prepare writes metadata branch/PR only, never main or Supabase',async()=>{
const f=prepareAPI();await createMetadataPR(MERGE,latest,record,f.request);
assert.ok(f.calls.filter(c=>c.o.method).every(c=>c.o.method==='POST'));
assert.ok(f.calls.every(c=>!c.p.includes('supabase')&&!c.p.startsWith('/git/refs/heads/main')));});
test('changed preparation branch is never overwritten',async()=>{
const f=prepareAPI(true);await assert.rejects(createMetadataPR(MERGE,latest,record,f.request),/Existing preparation branch changed/);
assert.ok(f.calls.every(c=>c.p!=='/git/refs'&&c.p!=='/pulls'));});
test('workflow boundaries: manual, no main push, prepare has no secrets, publish has read-only GitHub',()=>{
const pre=fs.readFileSync(new URL('../.github/workflows/update-latest-json.yml',import.meta.url),'utf8'),
pub=fs.readFileSync(new URL('../.github/workflows/publish-reviewed-metadata.yml',import.meta.url),'utf8');
assert.match(pre,/workflow_dispatch:/);assert.doesNotMatch(pre,/^\s+release:|secrets\.|SUPABASE_|HEAD:main|git push/m);
assert.match(pre,/contents: write/);assert.match(pre,/pull-requests: write/);assert.match(pub,/environment: Production/);
assert.doesNotMatch(pub,/contents: write|pull-requests: write/);
assert.ok(pub.indexOf('SUPABASE_SERVICE_ROLE_KEY:')>pub.indexOf('run: node scripts/release-flow.mjs verify-assets'));
assert.equal(fs.readFileSync(new URL('../.github/CODEOWNERS',import.meta.url),'utf8').trim().split(/\r?\n/).at(-1),'* @spekita');});
