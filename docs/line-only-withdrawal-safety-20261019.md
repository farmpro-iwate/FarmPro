# LINE-only account withdrawal: security requirements (2026-10-19)

Status: **blocked / design review required**. Do not expose a working delete button or bypass password verification yet.

## Confirmed incompatibility
- `server/src/accountWithdrawalStore.ts` requires `input.password` and verifies it with scrypt in `executeAccountWithdrawal` (lines 157–171).
- Its `userShape` requires `email` containing `@`, and both password hash and salt. A native LINE-only account may not have any of these.
- `previewAccountWithdrawal` generates a short-lived signed proof and checks contract constraints, other farm members, and farm ownership.
- A successful execution deletes farm directory and the account; this operation is destructive.
- `lineIdentityStore.ts` separately tracks LINE identities. The account deletion flow must also remove the binding or ensure withdrawn identities cannot resolve to active users, without touching unrelated mappings.

## Requirements before implementing
1. Preserve existing email-account withdrawal, including password confirmation, farm and billing checks, backup acknowledgement, confirmation, idempotency and durable tombstones.
2. LINE-only self-withdrawal needs **fresh, verified LINE reauthentication** bound to the same *currently authenticated* FarmPro user, same farm and LINE subject, and to the exact withdrawal intent. A merely valid existing FarmPro session is insufficient.
3. The proof must be short-lived, one-use, replay-protected, and linked to the pending withdrawal confirmation; do not accept client-supplied user/farm IDs as authority.
4. Preview must fail closed if identity is missing or ambiguous, any billing/subscription/other-member constraint is unresolved, or local data cannot be safely deleted.
5. Cross-account and operator withdrawal must retain separately authorized workflows. A LINE proof for one subject must never close another account.
6. Do not require a fictional email address for native LINE-only users. Define a compatible safe schema and migration policy before editing `userShape` or account storage.
7. Test preview, cancellation, expired/replayed proof, wrong browser/subject/farm, blocked subscription, no password LINE account, idempotent retry, and existing email withdrawal regression.
8. Test only on isolated fixtures first. Do not execute account deletion on the currently registered preview accounts or production data during diagnosis.

## Decision
No deletion-code change or live withdrawal was made during this audit. Implement only after the secure LINE reauthentication/withdrawal confirmation design and storage impact have been reviewed.
