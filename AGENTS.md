# SecureDevice-Releases: maelekezo ya kazi

Public APK releases na OTA/provisioning metadata. Default branch: `main`.

Public release repository; internal operations stay in the private source repositories.

## Mipaka ya mradi

Release metadata workflow inaweza kuita Supabase RPC wakati configuration yake ipo; hiyo ni remote write.

Repo hii ni PUBLIC. Hifadhi public artifact metadata pekee; usiweke customer data, internal operations register, secrets au recovery material.

## Kuanzisha na kupima

GitHub Actions/bash, gh, jq, curl, sha256sum/openssl; hakuna app build source hapa.

Hakuna dev server. Chunguza metadata na release assets kama data za release.

Read-only validation: `node --test scripts/validate-manifest.test.mjs` (Node.js22+), kupitia `manifest-validation.yml` kwa PR/main push. Hupima checked-in JSON/package/channel/URL na SHA256↔provisioning checksum, bila network/secrets/publish. Actual artifact bytes na signing certificate bado vihakiwe kabla ya publication; usiunde release kama test.

## Release na deployment

`update-latest-json.yml` hujibu release events/manual dispatch; inaweza kusasisha Supabase metadata na kusukuma latest.json main. Release event si kitendo kisicho na madhara.

Fuata scope iliyoidhinishwa na gates halisi za workflow. Mabadiliko ya maelekezo hayatoi ruhusa mpya ya production, publication au enrollment. Ruhusa iliyokwisha kutolewa kwenye task isirudiwe kuombwa bila sababu mpya.

## Jinsi ya kufanya kazi

- Wasiliana kwa Kiswahili kilicho wazi, isipokuwa mtumiaji aombe lugha nyingine. Fanya hatua za kompyuta zinazohitajika ndani ya scope iliyoidhinishwa; usiulize ruhusa tena kwa edits, ukaguzi au vipimo vya kawaida vinavyoweza kurudishwa.
- Kabla ya edits, hakiki repository, branch, git status na target environment. Hifadhi mabadiliko yaliyopo; usifute checkout ya zamani au kutumia reset/clean ili kuficha kazi ambayo haijacommitiwa. Tumia worktree tofauti kwa kazi sambamba.
- Tumia default branch halisi ya repo; usibadili jina lake kwa mazoea. Hifadhi CODEOWNERS, required checks na gates za deployment zilizopo. Usiswitch GitHub accounts ili kukwepa review.
- Tumia config ya development/staging iliyothibitishwa kwa runtime tests. Git branch/worktree haitenganishi database au remote API. Placeholder keys za CI ni za compilation tu.
- Secrets, signing material na data binafsi visiwekwe Git, logs au documentation. Thibitisha connection/account/project kwa read-only metadata kabla ya remote actions; usisome secrets ili tu kutambua account.
- Mwisho wa kazi eleza mabadiliko, vipimo vilivyofanyika, commit/PR na yaliyobaki. Build iliyofaulu si uthibitisho wa live deployment au business flow iliyofaulu.
- AGENTS.md ni mwongozo wa kazi; GitHub protections, database policies na ruhusa za zana ndizo zinazotekeleza mipaka ya access.

## Ushahidi wa commands

Commands zimetokana na source ya 79ba2f8ea34e (main), iliyokaguliwa 12 Septemba 2026. Soma definitions za sasa ikiwa scripts/workflows zimebadilika:

- [README.md](https://github.com/spekita-general-traders/SecureDevice-Releases/blob/79ba2f8ea34e47504e3e52f253b948af95d15690/README.md)
- [.github/workflows/update-latest-json.yml](https://github.com/spekita-general-traders/SecureDevice-Releases/blob/79ba2f8ea34e47504e3e52f253b948af95d15690/.github/workflows/update-latest-json.yml)

