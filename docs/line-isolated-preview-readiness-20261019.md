# LINE isolated preview: launch readiness (2026-10-19)

Branch: `agent/line-production-integration-audit-20261019`, draft PR #750. Not deployed to production.

## Verified
- `server/src/lineTrialApp.ts` is a separate, explicitly opt-in server entrypoint.
- `/api/auth/line/start`, `/callback`, and `/finish` are mounted only in that entrypoint, not `server/src/app.ts`.
- Backend HTTP negative-path checks are in `lineSession.http.test.ts`.

## Blockers before browser end-to-end testing
1. **Browser completion UI is missing.** The callback redirects to `/login/email?line=complete`, but `lineTrialApp.ts` mounts only API routes. As-is that redirect leads to 404 on the isolated API server. Do not interpret green CI as a successful browser login.
2. Provision an **entirely new isolated Render service**, or an independent equivalent with its own persistent data volume. Do not repoint the existing `farmpro-line-test` or production services/branch/disks.
3. The callback URI registered in the LINE Developers channel must match the new service's HTTPS origin and `/api/auth/line/callback` exactly. Do not overwrite existing callback URLs.
4. Configure `FARMPRO_LINE_ISOLATED_PREVIEW=true`, a separate `FARMPRO_DATA_DIR`, `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_LOGIN_CALLBACK_URL`, and `FARMPRO_ALLOWED_ORIGIN` in the isolated service only. Never paste secrets into GitHub or a chat.
5. Durable challenge/handoff stores use a local filesystem and process-local locks. **Single-writer/single-host only**; do not scale this preview horizontally.
6. The login-only preview **does not expose a new-account signup endpoint**. Use only throwaway accounts backed up in isolated data; avoid sharing or copying production user files.
7. Before live browser validation, implement a same-origin completion page that safely POSTs `/api/auth/line/finish` with the HttpOnly cookie and handles the response without exposing auth tokens in URL or logs. Align it with existing FarmPro client auth/session handling.

## Release gate
Never merge PR #750 or enable production routing until production/email legacy-account compatibility, actual browser end-to-end login, withdrawal/billing separation, and farm-level data isolation have been independently verified. A green CI alone is insufficient.
