import { createLineLoginChallenge } from './lineLoginOAuth';

// A bounded, single-process-only transaction store for isolated integration tests.
// Do not mount a production route until this is replaced by a shared, durable
// store with atomic consume across all app replicas.
type Challenge = { nonce: string; expiresAt: number };
const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 1000;

export class LineLoginChallenges {
  private pending = new Map<string, Challenge>();

  issue(now = Date.now()) {
    for (const [state, challenge] of this.pending) {
      if (challenge.expiresAt <= now) this.pending.delete(state);
    }
    if (this.pending.size >= MAX_PENDING) throw new Error('LINE_CHALLENGE_CAPACITY');
    const { state, nonce } = createLineLoginChallenge();
    this.pending.set(state, { nonce, expiresAt: now + TTL_MS });
    return { state, nonce };
  }

  consume(state: string, now = Date.now()): string {
    if (!/^[a-f0-9]{64}$/.test(state)) throw new Error('LINE_STATE_INVALID');
    const challenge = this.pending.get(state);
    this.pending.delete(state); // one attempt, including failed or expired callbacks
    if (!challenge || challenge.expiresAt <= now) throw new Error('LINE_STATE_EXPIRED_OR_USED');
    return challenge.nonce;
  }
}
