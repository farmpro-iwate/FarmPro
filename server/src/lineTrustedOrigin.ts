/** Allow only origins configured by the operator, including the LINE callback's origin.
 * Never derive trusted origins from Host or untrusted forwarded headers.
 */
export function isTrustedLineOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return false;
  const candidates = [env.FARMPRO_ALLOWED_ORIGIN?.trim(), env.LINE_LOGIN_CALLBACK_URL?.trim()]
    .filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') continue;
      if (url.origin === origin) return true;
    } catch {
      // Malformed server configuration is never a trusted origin.
    }
  }
  return false;
}
