# LINE-only account withdrawal: release gate (2026-10-17)

Status: **BLOCKED — do not expose withdrawal endpoints yet**. Development branch only.

## Verified existing parts
- `lineWithdrawalReauthBegin.ts` persists browser challenge and withdrawal purpose separately.
- `lineWithdrawalReauthComplete.ts` validates challenge, purpose and verified LINE subject; it expects a current authenticated FarmPro user.
- `lineWithdrawalProofStore.ts` issues and consumes one-use, five-minute server-side proof.
- `lineWithdrawalCommitPreparation.ts` validates snapshot and consumes proof under lifecycle lock.
- `accountWithdrawalStore.ts` performs authoritative billing/shared farm checks, writes a durable tombstone and then deletes farm data.
- `routes/accountWithdrawals.ts` exposes only password-based execution; LINE-only execution is blocked.
- `routes/lineLogin.ts` has login/link/signup callbacks but no withdrawal-specific callback.

## Missing integration (blockers)
1. A withdrawal-specific start endpoint must require the current FarmPro session, allow a LINE-only owner, validate Origin and establish an authenticated browser/session binding without placing bearer tokens or proof in redirect URLs. Explicit user intent and fresh confirmation are required.
2. The OAuth callback must verify code, issuer, audience, state/nonce, purpose, session binding, and exact LINE subject linked to the initiating user. It must never treat a normal login callback or an arbitrary user ID as withdrawal proof.
3. A short-lived single-use proof must be delivered through a same-origin authenticated flow, without leakage via URL/history/logs.
4. A dedicated execute endpoint must re-check owner, shared farm, active Stripe subscriptions/invoices, bank contracts, account snapshot, farm path safety, and withdrawals ledger **under lock**. Consume proof immediately before committing durable tombstone under that same lock.
5. Reuse existing `finish`/resume cleanup semantics. Never run destructive tests on a real farm. Failed cleanup remains retriable, and no other farm may be affected.
6. Client must display irreversible-data-deletion/backup confirmation and a clear result/recovery path; LINE-only users must not be prompted for a nonexistent password.
7. Add negative integration tests: wrong LINE subject, wrong browser/session, canceled/expired/replayed state, missing/expired/replayed proof, member/operator/shared farm, active Stripe/bank contract, changed snapshot, repeated execution, missing storage, and other-farm data preservation. Verify existing email-based withdrawal still works.

## Decision
Until items 1–7 pass in a disposable isolated test environment and a full review is completed, **keep LINE-only in-app withdrawal unavailable**, leave PR #705 Draft, and do not merge/deploy to production or trial Render. Provide users a working support-assisted withdrawal route during any pilot; do not claim self-service withdrawal is available.

This document records a gate only; it does not implement or authorize data deletion.
