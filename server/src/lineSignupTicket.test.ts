import test from 'node:test';
import assert from 'node:assert/strict';
import { issueLineSignupTicket, verifyLineSignupTicket } from './lineSignupTicket';

test('signup ticket is bound to verified LINE subject and rejects tampering', () => {
  const before = process.env.FARMPRO_AUTH_SECRET;
  process.env.FARMPRO_AUTH_SECRET = 'test-only-secret-for-signup';
  try {
    const ticket = issueLineSignupTicket('UlineSignup123');
    assert.equal(verifyLineSignupTicket(ticket), 'UlineSignup123');
    assert.throws(() => verifyLineSignupTicket(ticket + 'x'), /LINE_SIGNUP_TICKET_INVALID/);
    assert.throws(() => issueLineSignupTicket('someone@example.com'), /INVALID_LINE_SUBJECT/);
  } finally {
    if(before === undefined) delete process.env.FARMPRO_AUTH_SECRET;
    else process.env.FARMPRO_AUTH_SECRET = before;
  }
});
