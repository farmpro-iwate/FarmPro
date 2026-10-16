import { getWithdrawalAuthPolicy } from './withdrawalAuthPolicy';

/**
 * Validate persisted account rows without assuming every user has an email.
 * This is a pure migration aid, not a grant to enable LINE-only withdrawals.
 * The existing destructive route still requires email/password reauthentication.
 */
export function validWithdrawalAccountRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const u = row as Record<string, unknown>;
  if (typeof u.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(u.id) ||
      typeof u.farmId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(u.farmId) ||
      typeof u.farmName !== 'string' || !u.farmName.trim() ||
      typeof u.name !== 'string' || !u.name.trim() ||
      typeof u.active !== 'boolean' || !['owner', 'member'].includes(String(u.role)) ||
      (u.plan !== undefined && !['free', 'standard', 'pro'].includes(String(u.plan)))) return false;
  try { getWithdrawalAuthPolicy(row); return true; }
  catch { return false; }
}
