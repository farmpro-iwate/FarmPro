/** Shared, side-effect-free preflight for account withdrawal.
 * This must be evaluated for LINE-only and legacy email users alike, before
 * any destructive operation. Actual Stripe checks remain in the existing
 * withdrawal coordinator; this helper is not a replacement for those checks.
 */
export function evaluateWithdrawalSafety(input: {
  isOwner: boolean; isOperator: boolean; isLegacySharedFarm: boolean;
  hasOtherFarmUsers: boolean; plan: 'free'|'standard'|'pro';
  hasOpenBankApplication: boolean; cardBillingVerifiedEnded: boolean;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.isOperator) reasons.push('運営者アカウントは通常退会できません');
  if (!input.isOwner) reasons.push('農場代表者の確認が必要です');
  if (input.isLegacySharedFarm) reasons.push('旧共通データの個別確認が必要です');
  if (input.hasOtherFarmUsers) reasons.push('同じ農場に他の利用者がいます');
  if (input.plan !== 'free') reasons.push('有料契約の終了確認が必要です');
  if (input.hasOpenBankApplication) reasons.push('銀行振込の契約または申込が未完了です');
  if (!input.cardBillingVerifiedEnded) reasons.push('カード契約・請求状況を確認できません');
  return { eligible: reasons.length === 0, reasons };
}
