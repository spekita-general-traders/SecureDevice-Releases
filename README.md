# SecureDevice-Releases
Public APK releases for SecureDevice OTA provisioning

## Read-only metadata validation

Run `node --test scripts/validate-manifest.test.mjs` with Node.js 22+. CI checks PRs and main pushes using read-only repository permission, without secrets or network calls from the validator. It checks the actual `latest.json` package/channel, canonical release URL, version fields, SHA-256 and matching unpadded base64url provisioning checksum, including corrupted fixtures.

This does not download or verify APK bytes, signing certificates, or deployed app behavior. `update-latest-json.yml` is a separate publisher triggered by release events/manual dispatch; it can write Supabase metadata and push main. Never trigger that publisher as a validation test.
