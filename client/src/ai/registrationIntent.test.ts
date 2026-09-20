import { describe, expect, it } from 'vitest';
import { parseRegistrationIntent } from './registrationIntent';

describe('parseRegistrationIntent', () => {
  it('「1234 発情を登録して」を発情登録として判定する', () => {
    expect(parseRegistrationIntent('1234 発情を登録して')).toEqual({
      kind: 'heat',
      earTag: '1234',
    });
  });

  it('「1234の発情記録をして」も発情登録として判定する', () => {
    expect(parseRegistrationIntent('1234の発情記録をして')).toEqual({
      kind: 'heat',
      earTag: '1234',
    });
  });

  it('登録依頼ではない発情の質問は登録モードにしない', () => {
    expect(parseRegistrationIntent('1234の前回の発情はいつ？')).toBeNull();
  });

  it('耳標番号がない場合は登録モードにしない', () => {
    expect(parseRegistrationIntent('発情を登録して')).toBeNull();
  });
});
