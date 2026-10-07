import { assertAccountIdle } from './accountRequestLease';
import { validAccountIdentifier, withAccountDataLock } from './accountDeletionGuard';
import {
  getOperatorDeletionPreview,
  type AccountDeletionConfirmation,
  type AccountDeletionPreview,
} from './operatorAccountDeletionStore';
import { reviewStripeAccount, type StripeAccountReview } from './stripeAccountReview';

const RELEASE_PENDING = '新しい決済の受付停止と最終確認が未完了のため、削除はまだ実行できません。';

// The low-level erasure store is intentionally NOT imported here. A read-only
// Stripe scan cannot authorize erasure while checkout admission is uncontrolled.
// There is no request flag, environment switch, or cached review that bypasses
// this boundary. Keep it closed until the payment-entry lifecycle is implemented.
export async function getPublicOperatorDeletionPreview(userId: string, actorId: string) {
  if (!validAccountIdentifier(userId)) throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  const preview = await getOperatorDeletionPreview(userId, actorId);
  return {
    ...preview,
    locallyEligible: preview.canDelete,
    canDelete: false as const,
    reason: preview.reason || (preview.resuming
      ? '以前の削除が途中の状態です。最終確認が整うまで、この画面から削除を再開しません。'
      : RELEASE_PENDING),
  };
}

function parseConfirmation(userId: string, value: unknown): Readonly<AccountDeletionConfirmation> {
  if (!validAccountIdentifier(userId) || !value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  }
  const input = value as Record<string, unknown>;
  const fields = ['farmId', 'email', 'revision', 'confirmed'];
  if (Object.keys(input).some((name) => !fields.includes(name)) || input.confirmed !== true ||
      !validAccountIdentifier(input.farmId) || typeof input.email !== 'string' ||
      input.email.length > 320 || !input.email.trim().includes('@') ||
      typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) {
    throw new Error('ACCOUNT_CONFIRMATION_REQUIRED');
  }
  // Snapshot the confirmation before any await. Later request-body mutation
  // cannot silently switch the identity or revision being reviewed.
  return Object.freeze({ farmId: input.farmId, email: input.email.trim().toLowerCase(),
    revision: input.revision, confirmed: true });
}

async function readConfirmedTarget(userId: string, actorId: string, confirmation: Readonly<AccountDeletionConfirmation>) {
  return withAccountDataLock(async () => {
    // Rechecks the operator's current access as well as all local protections.
    const preview = await getOperatorDeletionPreview(userId, actorId);
    if (preview.resuming) throw new Error('ACCOUNT_DELETE_IN_PROGRESS');
    if (!preview.canDelete) throw new Error('ACCOUNT_DELETE_BLOCKED');
    if (confirmation.farmId !== preview.user.farmId ||
        confirmation.email !== preview.user.email.trim().toLowerCase() ||
        confirmation.revision !== preview.revision) throw new Error('ACCOUNT_CHANGED');
    assertAccountIdle(preview.user.farmId);
    return preview;
  });
}

export type OperatorDeletionGateResult = {
  status: 409 | 503;
  body: {
    deleted: false;
    canDelete: false;
    code: 'STRIPE_REVIEW_UNAVAILABLE' | 'STRIPE_REVIEW_REQUIRED' | 'ACCOUNT_DELETION_RELEASE_PENDING';
    message: string;
    stripeReview: StripeAccountReview;
  };
};

export async function assessOperatorDeletionRequest(
  userId: string,
  actorId: string,
  input: unknown,
): Promise<OperatorDeletionGateResult> {
  const confirmation = parseConfirmation(userId, input);
  const before: AccountDeletionPreview = await readConfirmedTarget(userId, actorId, confirmation);
  // Network I/O runs outside the account-store lock. Do not block unrelated
  // farms, and never use request-supplied email, mode, credentials or endpoints.
  const stripeReview = await reviewStripeAccount({
    id: before.user.id, farmId: before.user.farmId, email: before.user.email,
  });
  // This also rejects new payment history, concurrent requests, a changed target,
  // deletion that began elsewhere, and an operator who lost access during I/O.
  await readConfirmedTarget(userId, actorId, confirmation);

  if (stripeReview.state === 'unavailable' || !stripeReview.scanComplete || !stripeReview.checkedAt) {
    return {
      status: 503,
      body: { deleted: false, canDelete: false, code: 'STRIPE_REVIEW_UNAVAILABLE',
        message: 'Stripeの契約確認が完了していないため、削除を実行しませんでした。アカウント・利用状態・農場データは、この要求では変更していません。', stripeReview },
    };
  }
  if (stripeReview.state !== 'no_match') {
    return {
      status: 409,
      body: { deleted: false, canDelete: false, code: 'STRIPE_REVIEW_REQUIRED',
        message: 'Stripeに関連記録、または対象を特定できない決済手続きがあります。削除は実行せず、契約内容の確認が必要です。', stripeReview },
    };
  }
  // No match is necessary evidence, not sufficient authorization. In particular
  // it cannot close existing Payment Links or prevent a new external checkout.
  return {
    status: 409,
    body: { deleted: false, canDelete: false, code: 'ACCOUNT_DELETION_RELEASE_PENDING',
      message: `${RELEASE_PENDING} この要求では、アカウント・利用状態・農場データを変更していません。`, stripeReview },
  };
}
