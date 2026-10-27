import { createUser, emailExists, updateUserPlan } from './authStore';

const SERVICE_NAME = 'farmpro-settlement-profit-test';
const TEST_EMAIL = 'settlement-preview@farmpro.invalid';

async function start() {
  // This entrypoint is exclusively for the isolated Render settlement preview.
  // Never disable normal authentication or accept registration without verification.
  if (process.env.RENDER_SERVICE_NAME !== SERVICE_NAME ||
      process.env.NODE_ENV !== 'production' ||
      !process.env.FARMPRO_DATA_DIR?.startsWith('/tmp/farmpro-settlement-profit-test')) {
    throw new Error('SETTLEMENT_PREVIEW_ENVIRONMENT_REQUIRED');
  }
  const password = process.env.FARMPRO_SETTLEMENT_TEST_PASSWORD || '';
  if (password.length < 16) {
    throw new Error('FARMPRO_SETTLEMENT_TEST_PASSWORD_REQUIRED_MIN_16');
  }
  if (!(await emailExists(TEST_EMAIL))) {
    await createUser({
      farmId: 'settlement-preview-only',
      farmName: '精算テスト農場',
      name: 'テスト利用者',
      email: TEST_EMAIL,
      password,
      role: 'owner',
      plan: 'standard',
    });
  }
  // Preview-only: update exactly the known test account without replacing its
  // farm or cattle records. This does not create a Stripe subscription.
  await updateUserPlan(TEST_EMAIL, 'standard');
  // Import only after the test user exists; starts the unchanged production server.
  await import('./app');
}

start().catch((error: unknown) => {
  console.error('Settlement preview initialization failed:',
    error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
