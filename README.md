# SecureDevice-Releases
Public APK releases for SecureDevice OTA provisioning

## Read-only metadata validation

Run `node --test scripts/validate-manifest.test.mjs scripts/validate-release-tag.test.mjs` with Node.js 22+ and Bash (Git Bash on Windows). CI checks PRs and main pushes using read-only repository permission, without secrets or network calls from the validator. It checks the actual `latest.json` package/channel, canonical release URL, version fields, SHA-256 and matching unpadded base64url provisioning checksum, including corrupted fixtures. Release tags are passed through environment data and checked before publisher URL construction; unsafe-tag tests run only the isolated validation script.

This does not download or verify APK bytes, signing certificates, or deployed app behavior. `update-latest-json.yml` is a separate publisher triggered by release events/manual dispatch; it can write Supabase metadata and push main. Never trigger that publisher as a validation test.

The publisher's legacy direct push to main remains unchanged and may be blocked by PR-required branch protection. Its publication flow needs a separate review before use; validation must not bypass that protection.
