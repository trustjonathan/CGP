# CGP Release Checklist

## Before tagging

- [ ] Confirm the web, Android, and Windows sources are from the same reviewed commit.
- [ ] Confirm the Supabase migrations are applied and the production verification SQL passes.
- [ ] Confirm the Help knowledge copies are identical and the Edge Function sends only canonical FAQ questions to the model.
- [ ] Run web CI (release-source check, focused sync tests, full tests, typecheck, lint, production build, and preview smoke); build Android and Windows installers separately.
- [ ] Run the release test matrix, including offline sync, account switching, share/import, Help, updater, and keyboard accessibility.
- [ ] Confirm the Android `versionCode` increases and the APK is signed with the established release key.
- [ ] Confirm the Windows installer is signed and the update feed contains `latest.yml` and its matching `.blockmap`.
- [ ] Review the generated web build and both desktop/mobile installers without publishing credentials or test data.

The preview smoke check verifies that the production app root and built assets are served; it does not replace an authenticated Supabase data-load and sync test.

## Repository secrets

Configure these as GitHub Actions repository secrets; never commit their values:

- `CGP_ANDROID_KEYSTORE_BASE64` — base64-encoded Android signing keystore, decoded to a temporary runner file.
- `CGP_ANDROID_KEYSTORE_PASSWORD`
- `CGP_ANDROID_KEY_ALIAS`
- `CGP_ANDROID_KEY_PASSWORD`
- `CSC_LINK` — Windows code-signing certificate or secure certificate URL.
- `CSC_KEY_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN` — only if the workflow deploys Supabase functions or migrations.
- `GEMINI_API_KEY` — only if the workflow deploys the Help Edge Function; keep it out of all client builds.

`GITHUB_TOKEN` is provided by GitHub Actions and should be granted only the release permissions the workflow needs. Supabase project references and public URLs may be configured as repository variables instead of secrets when policy permits.

## Tag and verify

- [ ] Confirm `package.json` and the root `package-lock.json` version match; use `package.json` as the sole application version source.
- [ ] Create the exact `v<package.json version>` tag. The CI workflow rejects a mismatched release tag.
- [ ] Confirm the release page reports the web build's version and only links to artifacts attached to that exact tag.
- [ ] Verify tag CI passes the version gate and builds the web app from that tag.
- [ ] Separately verify the signed APK and Windows installer were built from the same release version; tag CI does not build those installers.
- [ ] Verify the Windows release includes the installer, `latest.yml`, and `.blockmap`.
- [ ] Verify all artifacts are attached to the same GitHub Release and the release notes identify platform-specific install/update behavior.
- [ ] Install the APK and Windows installer on clean devices; verify signing, version, login, offline launch, and update behavior.
- [ ] Verify web production health, download links, and the published release metadata.
- [ ] Record the release commit, tag, artifact checksums, test evidence, and any remaining risks.

## Publication gate

Do not publish if the three targets are not built from one reviewed source revision, if a signing key is unavailable, if any account-isolation or offline-sync test fails, or if the production database verification has not passed.
