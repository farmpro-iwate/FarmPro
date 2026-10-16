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


## 2026-10-16: staged no-email account migration gate

Current `authStore.FarmProUser` requires `email`, `passwordSalt` and `passwordHash`.
Do not weaken these fields to optional across every existing call site in one commit.
Implement a discriminated sign-in representation with explicit email credential presence,
while keeping existing persisted email users readable unchanged. New LINE-only users
must have no synthetic email/password and must never be returned from a password
authentication path.

Before user creation, audit all callers of `AuthUser.email` (client settings,
operator notices, email reset, Stripe/billing, withdrawals, exports, account recovery).
Separate contact email (unverified/verified/absent) from sign-in credentials.
A verified LINE subject is NOT an email address. Email uniqueness applies only
to actual verified email credentials. Operator notification should support absent
email explicitly and remain idempotent.

New LINE signups must require explicit confirmation of the farm name and owner
before writing user, farm and provider identity. The confirmation must be single
use and concurrency safe: no orphan user/farm if identity-binding persistence fails.
Never assume an in-process mutex protects multiple hosts. Use an appropriate durable
transaction or recoverable idempotency mechanism before enabling signup.

Add tests for legacy JSON compatibility, LINE user without email, signup replay,
concurrent duplicate identity, cross-farm data separation, Stripe subscription
unchanged, deletion cleanup and operator notification only once. Existing email
registration, password reset and sign-in tests must remain green.


## 2026-10-16: concrete persistence audit and release blocker

Read from current code:
- `authStore.createVerifiedUser` writes `users.json` with a required real email and password hash;
  it cannot be reused for LINE-only account creation.
- `lineIdentityStore.persistVerifiedLineLink` writes a separate
  `line-identity-bindings.json` and only accepts an **existing active user**.
- `jsonStore.writeJson` atomically renames **one file** but cannot atomically commit
  two files; `lifecycleLock` serializes only requests in one Node process.
- Existing duplicate-signup preflight (`lineSignupGuard`) is not a transaction.

**Release blocker**: Do not implement signup by calling createVerifiedUser followed by
persistVerifiedLineLink. Failure between calls leaves an orphan FarmPro farm/user;
concurrent registration may assign the same LINE subject inconsistently.

Required solution before mounting any LINE signup endpoint:
1. Pick and implement a **single authoritative transactional signup ledger**, with an
   identity uniqueness constraint and durable recovery on restart. One process is not
   itself a durable transaction; multi-instance deployment requires shared transactional
   storage.
2. Verify the LINE subject using server-side OAuth, issue a single-use short-lived
   signup ticket, and require explicit farm/profile confirmation.
3. Atomically or recoverably create the new Free owner, farm ID, identity mapping and
   idempotency result under one persisted operation. Retry of the same ticket must
   not create a second user or farm.
4. Never synthesize an email or password. Add a real optional contact-email model and
   audit callers before enabling email-less users.
5. Include fault-injection tests at every write step, restart recovery, concurrent
   duplicate registrations, withdrawal/re-registration, existing email sign-in and
   Stripe/notification regressions.
6. Keep signup route and button disabled until these tests pass and deployment
   topology is verified. No production environment variable changes yet.
