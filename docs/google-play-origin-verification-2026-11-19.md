# Android / Google Play: production-origin verification (2026-11-19)

**Status: BLOCKED on live-origin inspection. This does not mean FarmPro is offline.**

The sales-site repository currently links registration to `https://app.farmpro-app.jp/register` and LINE login to `https://app.farmpro-app.jp/api/auth/line/start`. The FarmPro repository's GitHub Pages PWA, however, is configured for `https://farmpro-iwate.github.io/FarmPro/` via the `/FarmPro/` base path. These two applications/paths MUST NOT be assumed equivalent.

The assistant attempted read-only requests for the root page, `/manifest.webmanifest`, `/FarmPro/manifest.webmanifest`, and `/.well-known/assetlinks.json` on 2026-11-19. The browser tool could not access the site and the isolated shell reported DNS resolution failures. This environment cannot establish the actual live route, HTTP status or manifest content. **Do not infer that the production service is down.**

## Run the preflight from a network that can reach the production origin

On Windows, with Node.js installed, open the FarmPro repository checkout at this branch and run:

```powershell
node scripts/audit-play-origin.mjs https://app.farmpro-app.jp
```

The command performs only anonymous HTTPS GET requests. It does not authenticate, clear local storage, change any records, run a deployment, or touch Stripe. Review output for the root response, linked manifest, root and manifest final URLs, `start_url`, `scope`, icons, and `assetlinks.json`. A 404 for `assetlinks.json` is expected **until** Android signing and website verification are set up.

## Decision gate for Bubblewrap

- If the production root is a normal web page with a valid PWA manifest: derive TWA URL strictly from **that verified live manifest** and site routing.
- If the production root is an auth gateway and no suitable manifest exists: prepare a test-only manifest and mobile shell under a verified app-owned origin; do not redirect to GitHub Pages or modify production without review.
- If the manifest or scope points to `/FarmPro/` on the production domain but that route does not work, fix only in an isolated branch after a reproducible test.
- Do not put test credentials, signing keys, fingerprints, or customer data into GitHub.
- Keep Google Play package creation, asset links, billing policy implementation, and IndexedDB migration on hold until origin inspection succeeds.

## Existing user-data safety gate

A new TWA package can be installed on Android while a separate PWA home-screen shortcut exists. Do not claim the devices will share the same IndexedDB contents unless the actual origins/storage partitions are verified. Demonstrate a test-only backup and non-destructive restore before recommending migration for real farms.

## Next evidence to capture

1. Redacted JSON output of the preflight script (no credentials; URL origin is okay).
2. Whether login and home screen use the same origin after sign-in; if not, record only hostnames/paths, not tokens.
3. Confirmation that the development copy of the Web Manifest is for the production app, not the GitHub Pages demo.
4. Play signing certificate fingerprint and verified domain control, once a package ID is selected and signing is established.

No production modifications were performed during this step.
