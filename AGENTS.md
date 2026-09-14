# SecureDevice-Releases: maelekezo ya kazi

Public APK releases na OTA/provisioning metadata. Default branch: `main`. Canonical release owner: **spekita**.

Repo hii ni PUBLIC. Weka public artifact metadata pekee; usiweke customer data, internal operations register, secrets au recovery material. Hifadhi CODEOWNERS na required CI/protections.

## Kupima

Node.js22+ na Bash/Git Bash:
`node --test scripts/validate-manifest.test.mjs scripts/validate-release-tag.test.mjs scripts/release-flow.test.mjs`
kisha `node scripts/release-flow.mjs validate`.

Hivi ni validation vya source/metadata na mocked API boundaries; havifanyi publication au network kwenye test cases. APK bytes/signing identity na actual Android versionCode bado vihakiwe kutoka trusted release/build evidence kabla ya publication. Hakuna dev server au APK build source hapa.

## Release workflow

`update-latest-json.yml` ni manual-main preparation ya owner spekita: explicit existing SecureDevice release tag + actual versionCode → public asset verification → metadata branch/PR. Haina Supabase credentials/writes wala direct main push.

`publish-reviewed-metadata.yml` ni manual-main publication tofauti baada ya metadata-only PR ku-merge na spekita na required CI kupita. Inahitaji exact PR/head/merge/tag/hash attestation, current canonical source na asset recheck. Final step pekee hupokea server secret, huita Supabase RPC na kuhakiki latest-row readback. Hii ni production write; usiendeshe kama test.

Soma [README.md](README.md) kwa actual token/create-PR setting, workflow-run approval, Production environment na server-secret requirements. Hakuna automatic reviewer approval, bypass, forced push, credentials provisioning au key rotation iliyotolewa na source hii.

## Namna ya kufanya kazi

- Wasiliana kwa Kiswahili rahisi isipokuwa iombwe lugha nyingine. Kamilisha kazi iliyoidhinishwa bila kuuliza confirmations za kurudia.
- Kabla ya edits, hakiki repo/branch/status; hifadhi changes zilizopo. Usifanye reset/clean kuficha kazi.
- Tumia actual owner identity `spekita` kwa release. Usiswitch accounts ili kuonyesha independent review ya mtu yuleyule.
- Git branch haibadili backend target. Tumia synthetic/mocked boundaries kwa tests; usitumie production publication kama validation.
- Usiprint secrets, raw provider responses au private payloads. Missing permissions/auth zielezwe kama gaps halisi; usizibypass.
- Mwisho rekodi changed files, tests, exact commit/PR na remaining gates. CI PASS si production publication proof.

