# Google Play readiness audit (2026-11-19)

Status: investigation only. DO NOT deploy or merge this branch until manual review.

## Verified source facts
- `client/vite.config.ts`: Vite base is `/FarmPro/`.
- `client/public/manifest.webmanifest`: start_url and scope are `/FarmPro/`; icons are SVG only.
- `client/public/sw.js`: service worker shell is scoped to `/FarmPro/` and caches a fixed icon asset.
- `client/src/storage/db.ts`: browser IndexedDB is named `farmpro-local`, schema version 4.
- `client/src/storage/initialize.ts`: initialization opens the local database and maintains version metadata.
- `client/src/main.tsx`: application launch initializes local storage before rendering, then registers the service worker.

## Hard blockers to verify before packaging
1. Confirm the **actual production app origin and path**. Public sales domain and app origin are not interchangeable. The `/FarmPro/` path must not be assumed to work on the production app domain.
2. Confirm live manifest, icon formats (PNG 192/512 and maskable), HTTPS, service-worker install and offline routes using a read-only browser test. Current SVG-only manifest is not yet proven compatible with packaging.
3. Decide exact origin for Android TWA and set the origin's `/.well-known/assetlinks.json` **only after** Play App Signing certificate SHA-256 and package ID are known. Do not invent fingerprints.
4. Run an isolated, non-production data test of new installation, login/logout, cloud sync, local backup/restore, and upgrade from current home-screen PWA. Browser storage can be separate if the verified origin differs. Never clear production IndexedDB or auto-restore over an existing farm.
5. Review Google Play payment policy and available Japan billing-choice eligibility before exposing existing Stripe signup/checkout flows from the Play-distributed app. Do not change Stripe subscriptions until reviewed.
6. Decide Play Console developer identity, app ID, signing ownership and required testing track. Do not create or publish a release without user approval.

## Acceptance criteria before first Android internal test
- A disposable test farm/account is used, with test-only data.
- No changes to production database, API, sync, authentication, billing or Render settings.
- Any Android build launches the verified intended production-or-test origin; no blank page or incorrect `/FarmPro/` path.
- Local data preservation is demonstrated across PWA-to-TWA migration if reuse is expected, otherwise a documented backup/import migration is provided and tested.
- Package ID, signing fingerprint, and `assetlinks.json` match, with verified TWA fullscreen operation.
- Payment flow is policy-reviewed and is not exposed in a noncompliant form.

## Implementation choice
Use Google's Trusted Web Activity via Bubblewrap **only after** the checks above. Do not introduce native wrappers or a new database as a shortcut. This audit is documentation only; it does not implement an Android app or establish Play eligibility.

## References
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://support.google.com/googleplay/android-developer/answer/12570971
