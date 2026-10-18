import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTrustedLineOrigin } from './lineTrustedOrigin';

test('trusts configured production callback origin, even with Render default URL', () => {
  const env = {
    RENDER_EXTERNAL_URL: 'https://farmpro-app.onrender.com',
    LINE_LOGIN_CALLBACK_URL: 'https://app.farmpro-app.jp/api/auth/line/callback',
  } as NodeJS.ProcessEnv;
  assert.equal(isTrustedLineOrigin('https://app.farmpro-app.jp', env), true);
  assert.equal(isTrustedLineOrigin('https://evil.example', env), false);
  assert.equal(isTrustedLineOrigin('https://farmpro-app.onrender.com', env), false);
});

test('trusts explicitly configured allowed origin and rejects missing origin', () => {
  const env = { FARMPRO_ALLOWED_ORIGIN: 'https://app.farmpro-app.jp' } as NodeJS.ProcessEnv;
  assert.equal(isTrustedLineOrigin('https://app.farmpro-app.jp', env), true);
  assert.equal(isTrustedLineOrigin(undefined, env), false);
  assert.equal(isTrustedLineOrigin('https://app.farmpro-app.jp.evil.example', env), false);
});

test('does not trust malformed callback or scheme downgrade', () => {
  const env = { LINE_LOGIN_CALLBACK_URL: 'not-a-url', FARMPRO_ALLOWED_ORIGIN: 'http://app.farmpro-app.jp' } as NodeJS.ProcessEnv;
  assert.equal(isTrustedLineOrigin('http://app.farmpro-app.jp', env), false);
  assert.equal(isTrustedLineOrigin('https://app.farmpro-app.jp', env), false);
});
