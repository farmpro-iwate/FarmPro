# LINE full-app isolated verification — 2026-10-19

## State
PR #750 is a Draft. Do not merge into `agent/paid-mainline-sync` or deploy to `farmpro-app`.
Latest confirmed green CI: `0246df4c` (Actions run 39199304090).

## Isolation prerequisites
- Provision a **new** Render web service from `agent/line-production-integration-audit-20261019`; do not edit `farmpro-app`, `farmpro-line-test`, or `farmpro-line-preview`.
- Use the normal full-app build and `npm --prefix server start`, **not** `npm run line:preview`.
- Set `FARMPRO_LINE_FULL_APP_PREVIEW=true`, `FARMPRO_LINE_ISOLATED_PREVIEW=false`, `NODE_ENV=production`.
- Set `FARMPRO_ALLOWED_ORIGIN` to the new service HTTPS origin and `LINE_LOGIN_CALLBACK_URL` to that origin plus `/api/auth/line/callback`. Register that exact callback in the LINE developer console.
- Provide independent `FARMPRO_AUTH_SECRET`, `FARMPRO_DATA_DIR`, LINE channel ID and secret via Render secret environment settings; never put secrets in GitHub or chat.
- Use a **new, separate persistent disk**, never a production disk, production backup, or existing preview disk. Confirm `RENDER_EXTERNAL_URL` matches the allowed origin.
- Keep auto-deploy off and prohibit sharing production user stores, subscriptions, credentials, or cattle databases.

## Remaining blockers
- LINE callback now sends non-isolated logins to `/login?line=complete`, but this is not yet browser-tested.
- LINE signup routes and preview signup page have been conditionally mounted in the isolated full-app preview; this is NOT yet CI-verified or browser-tested. The signup page still has verification-only wording and requires dedicated UX review.
- Existing LINE-account mapping, app homepage and cattle ledger need real browser testing against independent test records.
- Email login/reset, farm segregation, Stripe and account deletion regressions must pass before considering release.

## Browser acceptance
1. Confirm LINE button appears only when LINE API is available.
2. Existing test LINE user completes callback, handoff and reaches authenticated homepage.
3. Access `/cattle` using only records in the newly created test farm; confirm other farms cannot be accessed.
4. Test LINE new registration when full-app signup is implemented, then repeat login.
5. Re-test email signup/login/reset, logout, Stripe-free path and withdrawal without affecting live accounts.
6. Save evidence of pass/fail and CI result; do not declare production ready based on unit tests alone.
