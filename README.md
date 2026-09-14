# SecureDevice-Releases

Public APK releases and OTA/provisioning metadata. Release owner: **spekita**.

## Validation

Run `node --test scripts/validate-manifest.test.mjs scripts/validate-release-tag.test.mjs scripts/release-flow.test.mjs`, then `node scripts/release-flow.mjs validate` with Node.js22+ and Bash/Git Bash. The required **Validate SecureDevice release manifest** PR/main check uses read-only permissions and no production credentials. Tests use synthetic data and mocked API responses; they do not run either release workflow.

## Two-phase metadata publication

1. From current **main**, owner `spekita` manually runs **Prepare SecureDevice metadata PR** (`update-latest-json.yml`) with an explicit existing published SecureDevice tag and the APK's actual Android versionCode. There is no automatic release-event trigger and no ambiguous latest-release lookup: this repository also contains other applications.
2. Preparation downloads only canonical public `app-release.apk` and `provisioning-metadata.json`, validates their identities, sizes, hashes and allowlisted provisioning fields, and opens a `release/metadata-...` branch/PR changing only `latest.json` and `release-metadata.json`. It never writes Supabase or main. Existing branches with unexpected changes are rejected, never force-pushed.
3. Review both JSON files, actual APK versionCode and signing identity. Rollout percentage, force-update, notes and minimum-supported version are preserved for explicit PR review. The release's published timestamp is recorded. The old optional empty certificate/signature pair remains allowed for compatibility; a populated pair must be consistent. Metadata checks do **not** independently verify the APK signing certificate or extract Android versionCode. Verify those from the trusted signed APK/build evidence before approving publication.
4. If GitHub displays **Approve workflows to run** for the token-created PR, the owner starts those runs. This starts validation; it is not a second-person review. Wait for required CI and merge normally through branch protection.
5. From the resulting current **main**, owner `spekita` manually runs **Publish reviewed SecureDevice metadata**. Supply the metadata PR number, full tested head SHA, current main merge SHA and exact acknowledgement:
   `PUBLISH PR#<number> HEAD <head> MERGE <merge> TAG <tag> SHA256 <apk-sha256>`.
6. Publication requires that exact metadata-only PR, merged by `spekita`, canonical successful GitHub Actions PR validation, current main/workflow SHA and owner permission. It re-downloads public assets and verifies the reviewed IDs/hashes before sending the existing `upsert_secure_app_release` RPC. It then reads back the active latest row and compares all published metadata. There is no redirect following with credentials and no automatic retry of an ambiguous write.

This PR prepares the workflows; it does not itself prepare a release manifest or publish an APK/Supabase row. The initial source/code PR cannot satisfy the metadata-only publication gate. A subsequent release metadata PR is required. Unrelated main updates after that merge require a new validated metadata-only PR/current-main dispatch; do not relax the exact-source gate.

GitHub can return an empty workflow-run PR list after merge. Only for a valid empty list, publication verifies the exact source branch and the unique closed/merged PR returned for the approved head commit, including the same head, main merge and canonical repositories. A nonempty conflicting list, missing/malformed data or an incomplete/API-failed lookup still stops publication. See the [commit association API](https://docs.github.com/en/rest/commits/commits#list-pull-requests-associated-with-a-commit).

## Permissions and configuration required before first use

- Preparation uses the job's `GITHUB_TOKEN` with only `contents:write` and `pull-requests:write`; credentials are not persisted in checkout. Repository/organization policy must permit **Allow GitHub Actions to create and approve pull requests**. The workflow only creates PRs; it does not approve or merge. Read-only inspection on14September2026 found this setting disabled. No setting was changed by this implementation.
- Current [GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) says token-created PR workflows can require an owner to approve them to run. A scoped GitHub App/PAT is an optional future choice for automatic CI, not a prerequisite invented by this flow. No App/PAT has been provisioned.
- Publication uses read-only GitHub contents/PR/checks/actions permissions. It does not need a repository administration token and never changes protection. Its fixed owner is `spekita`.
- Configure **Production** environment for protected main and verify its intended secret scope before dispatch. Read-only inspection on14September2026 found no existing environment. This source has not created or configured one; do not assume GitHub creates an approval gate automatically from the name.
- Publication's final step requires existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secret names. The URL must equal the fixed intended project origin declared in `scripts/release-flow.mjs`; verify that actual binding before use. The key may be a modern `sb_secret_...` or legacy service_role JWT for that project. Missing/masked/wrong-project inputs fail closed. No value has been read, rotated or provisioned for this change.
- Server credentials are absent from preparation, checkout, setup and preliminary verification steps; only the final trusted publication step receives them. That step repeats source/assets checks before the write. RPC grants remain unchanged.

A successful RPC followed by failed readback is an unresolved publication, not a safe retry signal. Inspect the current latest row first. GitHub release assets can be replaced; this flow checks their current IDs and full content hashes before publishing, but cannot make separate GitHub and Supabase services one atomic transaction. Preserve signed artifact/build evidence and review unexpected changes.
