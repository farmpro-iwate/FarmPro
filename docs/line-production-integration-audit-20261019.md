# LINE production integration audit — 2026-10-19

## Isolation
- Source of truth for production: `agent/paid-mainline-sync`; Render service `farmpro-app` must remain on it.
- LINE staging: `agent/line-login-foundation-20261014`; Render service `farmpro-line-test`.
- This audit branch originates from production. **No LINE code has been integrated here.** Never deploy this audit branch.
- GitHub compare: source diverged; LINE branch 267 commits ahead and 4 behind; 127 changed files. Do not bulk-merge.

## Integration scope, in order
1. Preserve production cattle sync and calf classification changes: `client/src/services/singleCattleCloudRetry.ts`, `client/src/services/cattleRecordSyncApi.ts`, `server/src/cattleRecordSyncStore.ts`, `server/src/routes/cattle.ts`, `client/src/pages/CattleList.tsx`, `CalfList.tsx`, `Home.tsx`. Treat these as protected production behavior.
2. Isolate LINE sign-in domain: `server/src/lineLoginOAuth.ts`, `lineLoginChallenges.ts`, `lineLoginHandoff.ts`, `lineIdentityStore.ts`, `lineCanonicalSignupStore.ts`, `lineSignupTicket.ts`, `lineFreeSignup.ts`, `routes/lineLogin.ts`, plus their directly imported dependencies. Review all dependencies before copying.
3. Reconcile shared files manually rather than overwriting them: `server/src/authStore.ts`, `app.ts`, `stripeWebhook.ts`, `accountWithdrawalStore.ts`, `client/src/App.tsx`, `services/authClient.ts`, `pages/LoginPage.tsx`, `pages/SettingsPage.tsx`. Keep legacy email credentials, farm IDs, operator flows, subscription mapping intact.
4. Defer optional existing-email-to-LINE linking and dedicated LINE withdrawal until their end-to-end release gates pass. Only LINE Free signup, returning LINE login, billing contact verification and legacy email continuity belong in initial rollout.
5. Maintain feature flags disabled by default; do not enable `FARMPRO_LINE_SIGNUP_ENABLED` on production until deployment, LINE callback configuration, and regression checks pass.

## Minimum release gates (not yet run on integration branch)
- Both client and server: install, tests, build.
- Existing mail signup/login/reset, existing free/paid owner, Stripe customer and webhook mapping unchanged.
- LINE new Free signup, returning login, duplicate identity and replay refusal, user/farm isolation.
- Cattle list, calf classification, single-animal cloud resend and PC/mobile reconciliation preserved.
- Existing session, IndexedDB ownership and account-switch isolation.
- Staging Render smoke test after integration and independent production backup/rollback plan.
- Production LINE channel configuration and exact HTTPS callback; explicit operator approval to release.

Status: **AUDIT ONLY — production release not authorized.**
