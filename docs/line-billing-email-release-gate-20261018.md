# LINE-only billing email: isolated implementation gate (Issue #724)

Status: DESIGN ONLY. No payment, email enrollment or production endpoints enabled.

## Confirmed behavior (2026-10-18)
- LINE-only users can register and log in without email or password in isolated environment.
- PaidPlanApplicationPage disables both payment methods without email.
- Bank transfer API rejects email-less users with BILLING_EMAIL_REQUIRED.
- Stripe webhook tests reject plan assignment for email-less LINE identities.
- Existing /api/auth/email-change/start requires password authentication, so it is NOT usable by LINE-only users.
- authStore.FarmProUser currently types email and password credentials as required, despite persisted LINE-only users having neither.
- updateUserEmailById writes email under lifecycleLock but does not by itself establish verified billing email semantics or enable LINE-safe paid checkout.

## Required invariants
1. A LINE subject and its existing userId/farmId stay unchanged when adding a contact/billing email.
2. A billing email is not a password login credential. Email-only authentication must stay unavailable unless independently, explicitly enrolled.
3. Require current authenticated LINE-only owner session, fresh LINE reauthentication bound to that exact user/farm/browser, and a single-use purpose-specific challenge.
4. Send a six-digit code to the requested email with rate limit, expiry, max attempts and replay prevention. Do not commit email until successful proof.
5. A pending challenge must be bound to verified LINE subject, userId, farmId, email and issuance version. Verify uniqueness and user/account state again under the same lifecycle lock at commit time; recover safely from restart/concurrency.
6. No token/nonce/code in query strings, analytics, or logs. Avoid account enumeration and avoid leaking whether a billing email is already used.
7. Expose billing-verified state independently of loginMethod. Audit server-side billing and webhook paths; do not rely solely on a client-side 'email exists' check.
8. Do not create Stripe customers/subscriptions or bank transfer requests in the enrollment flow. Do not change plan, farm data or IndexedDB.
9. Existing email/password registration, change/reset, operators, subscription cancel/withdrawal, and existing Stripe users must be regression-tested.

## Staged implementation
A. Define backward-compatible persisted user credential kinds and optional verified billing contact. Add migration/read compatibility tests for existing users and LINE-only records; NO live migration yet.
B. Add purpose-scoped challenge storage and isolated POST /api/auth/line/billing-email/start and /verify endpoints with explicit owner authentication and re-auth requirement. Add negative/restart/concurrency tests.
C. Add Settings page enrollment UI visible only to LINE-only owners; no billing checkout changes yet.
D. Audit/adjust bank/Stripe checkout, webhooks, refunds, cancellation, userId/farmId binding, and messaging. Test with fake Stripe events before enabling payment.
E. Validate LINE re-login, preservation of records, operator notifications and recovery in isolated disposable environment. Require separate release review for any live rollout.

## Immediate blockers
- Current emailChangeVerificationStore uses a per-user challenge file and verifyPendingEmailChange consumes a challenge before updateUserEmailById. Do not reuse it without handling durable identity-bound commit and idempotency.
- Current persisted user model conflates verified billing email with password credential. Do not add email directly without distinguishing these states.
- LINE-only self-withdrawal remains blocked and must not be silently advertised as self-service.
- A second real LINE test identity is unavailable; simulated distinct identities are useful, but are not equivalent to two-account real-device validation.

Do not merge this plan into production, and do not expose LINE paid purchase links yet.
