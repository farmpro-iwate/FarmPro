# FarmPro Android (Google Play) preparation

Status: **configuration prepared only; no signed AAB has been built or uploaded**.

## Fixed information

- App: 繁殖Farm Pro
- Google Play package ID: `jp.farmpro.app` (already reserved in Play Console)
- Website: `https://app.farmpro-app.jp/`
- Approved icon: `https://app.farmpro-app.jp/farmpro-icon-blue.png`
- Android approach: Trusted Web Activity (TWA), reusing the existing PWA without modifying its IndexedDB, sync, billing, auth, or data.
- Target SDK: **36 or higher** for new submissions in November 2026. Do not submit API 35 builds.

## Build steps (developer workstation with JDK, Android SDK, Node.js)

1. Verify the live HTTPS PWA, login, external links, offline/online sync, photo/file handling and that the manifest and approved icon resolve.
2. Run `npm install -g @bubblewrap/cli` (or an isolated equivalent).
3. From `android-twa`, run `bubblewrap update` to generate project files from `twa-manifest.json`. If the tool requests a signing keystore, create a **new private upload key on the owner's trusted machine**. Keep keystore and passwords outside GitHub; back them up securely.
4. Inspect `app/build.gradle` and **verify both `compileSdkVersion` and `targetSdkVersion` are at least 36**. If not, update generator/toolchain or the Gradle project appropriately before attempting upload. Do not blindly reuse an outdated generated project.
5. Verify `packageId = jp.farmpro.app`, `versionCode = 1` (or a higher unused code) and the approved icon.
6. Run `bubblewrap build` and enter signing key passwords locally. Confirm the **signed** `app-release-bundle.aab` is produced and its package, signature and target API are correct.
7. Register the upload certificate fingerprint for `https://app.farmpro-app.jp/.well-known/assetlinks.json` in a **separate, carefully reviewed PWA/static-only change**. If Google Play App Signing uses a distinct app signing key, also include its fingerprint. Check the Digital Asset Links response is accessible and valid before a TWA rollout.
8. Test a signed APK on Android. Check Google/LINE/email login (including external auth return), IndexedDB data isolation, network reconnect and sync, backups/import/export, permission prompts, camera uploads, billing flow and app reopen.
9. Only after testing, upload signed `.aab` through Google Play Console > Internal testing > Create new release. Never upload keys or passwords in a chat or PR.

### Safety notes
- The Play icon and PWA are already configured. This directory is additive; it does **not** change the production server or the account's existing records.
- Digital Asset Links fingerprint depends on the **actual signing certificate**; it cannot safely be invented ahead of key creation.
- Depending on user login providers and OAuth redirect restrictions, a TWA may require app-specific testing or configuration.
- Google Play policy, payments, and eligibility declarations must reflect the actual delivered app.
- The TWA wrapper requires live network access to the deployed FarmPro service for its normal behavior.

References:
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli
- https://support.google.com/googleplay/android-developer/answer/11926878
