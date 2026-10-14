# LINE Login integration - implementation gate (Issue #704)

Status: design foundation only. Do not enable a LINE button before server callback, token verification, user linking and tests are completed.

## Existing entry points
- `client/src/pages/RegisterPage.tsx`: email-code Free signup
- `client/src/pages/LoginPage.tsx`: password login
- `client/src/services/authClient.ts`: existing token and farm ownership handling
- `server/src/routes/auth.ts`: /register, /register/verify and /login
- `server/src/authStore.ts`: users.json; email required, salted password required

## Mandatory schema changes before LINE signup
Never manufacture a placeholder email or password to satisfy the current required fields. Introduce separately persisted, unique external login identities: (provider = line, providerSubject) -> internal userId. LINE providerSubject is verified server-side from the LINE ID token and may not be provided by browser request parameters. Keep userId/farmId stable for linked existing accounts. If a user has no verified email, represent it honestly as absent; audit all email-dependent billing, operator and recovery flows before changing authStore schema.

## OAuth endpoints (proposed, not implemented)
- GET /api/auth/line/start: generate secure short-lived, one-time state and nonce, store server-side, redirect to LINE authorization (code flow); use PKCE only where supported and correctly configured.
- GET /api/auth/line/callback: validate state and one-time use, exchange code server-side, verify LINE ID token signature, issuer, audience, expiration and nonce; do not trust client profile claims.
- First-time LINE identity: hold verified provider subject in short-lived server-side signup ticket, ask for farm name and display name, explicitly confirm creation of a new Free account. Never create accounts merely on callback.
- Logged-in account linking: require current FarmPro authentication and recent reauthentication; reject already-linked LINE identities.
- Existing verified identity: issue FarmPro token only after finding active linked user; preserve farm ID/plan.
- Unlink: disallow removing the user's last available sign-in method.
- Abort/callback error: no account or farm mutation.

## Security and consistency
- Never link by matching email alone; do not infer email from LINE profile; do not auto-merge farms.
- Persist signup completion, internal user and provider mapping atomically or with recoverable idempotency; unique constraint on provider identity.
- Treat state, nonce, signup tickets and auth codes as one-use, expiring secrets; sanitize redirects to same origin.
- Keep LINE_CLIENT_ID and LINE_CLIENT_SECRET in server environment, never client bundles or Git.
- Preserve registration notification exactly once on confirmed signup; mark source as LINE for operator when applicable.
- Existing email-code registration and reset routes remain unchanged.
- Verify Stripe mapping, deletion, account recovery, per-farm isolation and IndexedDB ownership across linked accounts.
- Confirm the deployment connected to app.farmpro-app.jp before shipping; do not deploy from this branch until confirmed.

## Required tests / release gate
1. LINE first signup, subsequent login, explicit existing-user linking.
2. Reused / mismatched / expired state or nonce, bad signature, invalid audience, callback replay and cancellation.
3. Duplicate concurrent signup, duplicate LINE linking, disabled user, login with deleted account.
4. Existing email signup/verify/reset unaffected; existing FarmPro userID/farmID, paid subscriptions unchanged.
5. Cross-farm authorization, no inherited IndexedDB data across account switches, admin signup notification once.
6. Feature disabled without LINE credentials; no exposed nonfunctional sign-in CTA in production.
