# Separate LINE login preview: deployment checklist

Draft PR #750, branch `agent/line-production-integration-audit-20261019`.
Do **not** merge to production or repoint `farmpro-line-test` / `farmpro-app`.

## New service only
Create a **new** Render web service from this branch, with root directory `server`, build command `npm ci && npm run build`, and start command `npm run line:preview`. Use a new dedicated persistent disk and distinct hostname. These are planned settings, not an executed deployment.

Configure only on this new service:
- `FARMPRO_LINE_ISOLATED_PREVIEW=true`
- `FARMPRO_DATA_DIR` = dedicated writable disk directory (not any existing service directory)
- `LINE_LOGIN_CHANNEL_ID` and `LINE_LOGIN_CHANNEL_SECRET` = secure LINE Developers secrets
- `LINE_LOGIN_CALLBACK_URL=https://<NEW-HOST>/api/auth/line/callback`
- `FARMPRO_ALLOWED_ORIGIN=https://<NEW-HOST>`
- `FARMPRO_AUTH_SECRET` = newly generated secret dedicated to this preview
- `NODE_ENV=production`

In LINE Developers, **add** the exact new callback URL; do not replace the two existing callback registrations. If the channel limits callback URLs, stop and assess rather than modify existing entries.

## Important test limitations
The preview is login-only; there is no exposed account registration endpoint.
Use only an isolated test account provisioned securely for this preview. Do not copy production `users.json`, cattle records, or Stripe credentials.
The callback ends on an isolated status page and deliberately does **not** log into full FarmPro or persist a browser token.
The filesystem stores use process-local locks: single instance and single writer only.
Check the OAuth round trip, callback origin, cookie flags and one-time handoff using a browser.
After testing, remove test-only user data and disable the preview. Do not deploy PR #750 to production until code review, security and full app E2E verification are complete.

## Current result
Automated validation on commit `458ebb5`: success. No Render service has been created by this checklist.
