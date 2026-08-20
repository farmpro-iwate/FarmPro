import { describe, expect, it, vi, beforeEach } from 'vitest';

const emailExists = vi.fn();
const createPendingPasswordReset = vi.fn();
const sendPasswordResetVerificationEmail = vi.fn();

vi.mock('../authStore', async () => {
  const actual = await vi.importActual<typeof import('../authStore')>('../authStore');
  return {
    ...actual,
    emailExists,
  };
});

vi.mock('../passwordResetVerificationStore', () => ({
  createPendingPasswordReset,
  verifyPendingPasswordReset: vi.fn(),
}));

vi.mock('../emailSender', () => ({
  sendRegistrationVerificationEmail: vi.fn(),
  sendEmailChangeVerificationEmail: vi.fn(),
  sendPasswordResetVerificationEmail,
}));

describe('password reset resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailExists.mockResolvedValue(true);
    createPendingPasswordReset
      .mockResolvedValueOnce({ code: '111111' })
      .mockResolvedValueOnce({ code: '222222' });
    sendPasswordResetVerificationEmail.mockResolvedValue(undefined);
  });

  it('creates and sends a new code on every start request', async () => {
    const email = 'sekiguchi_a@cameo.plala.or.jp';

    const first = await createPendingPasswordReset(email);
    await sendPasswordResetVerificationEmail(email, first.code);

    const second = await createPendingPasswordReset(email);
    await sendPasswordResetVerificationEmail(email, second.code);

    expect(createPendingPasswordReset).toHaveBeenCalledTimes(2);
    expect(sendPasswordResetVerificationEmail).toHaveBeenNthCalledWith(1, email, '111111');
    expect(sendPasswordResetVerificationEmail).toHaveBeenNthCalledWith(2, email, '222222');
  });
});
