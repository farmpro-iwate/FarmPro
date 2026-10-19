import { consumeLineHandoff } from './lineLoginHandoff';
import { createToken, findActiveUserById } from './authStore';

/** Server-only finish step; no public route is mounted.
 * Consumes the ticket first and rechecks user status before issuing a token.
 */
export async function finishLineLoginSession(ticket: string) {
  const userId = await consumeLineHandoff(ticket);
  const user = await findActiveUserById(userId);
  if (!user || user.active !== true || !user.farmId) {
    throw new Error('LINE_USER_UNAVAILABLE');
  }
  return { token: createToken(user), user };
}
