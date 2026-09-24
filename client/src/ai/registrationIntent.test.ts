import { describe, expect, it } from 'vitest';
import { parseRegistrationIntent } from './registrationIntent';

describe('parseRegistrationIntent', () => {
  // Regression: natural language in AI record mode.
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

  it('「1234 AIを登録して」を授精登録として判定する', () => {
    expect(parseRegistrationIntent('1234 AIを登録して')).toEqual({
      kind: 'insemination',
      earTag: '1234',
    });
  });

  it('「1234 治療を登録して」を治療登録として判定する', () => {
    expect(parseRegistrationIntent('1234 治療を登録して')).toEqual({
      kind: 'treatment',
      earTag: '1234',
    });
  });

  it('「1234 ワクチンを登録して」をワクチン登録として判定する', () => {
    expect(parseRegistrationIntent('1234 ワクチンを登録して')).toEqual({
      kind: 'vaccine',
      earTag: '1234',
    });
  });

  it('AIで記録モードでは「はなみつ、今日発情」を発情登録として判定する', () => {
    expect(parseRegistrationIntent('はなみつ、今日発情', { recordMode: true })).toEqual({
      kind: 'heat',
    });
  });

  it('AIに聞くモードでは「はなみつ、今日発情」を登録として判定しない', () => {
    expect(parseRegistrationIntent('はなみつ、今日発情')).toBeNull();
  });

  it('AIで記録モードでは子牛群への飼料使用を判定する', () => {
    expect(parseRegistrationIntent('腹づくりを子牛群に10kg使った', { recordMode: true })).toEqual({
      kind: 'feed-use',
      feedName: '腹づくり',
      feedQuantity: '10',
      feedUnit: 'kg',
      feedTargetType: 'calfGroup',
    });
  });

  it('AIで記録モードでは繁殖牛群への袋使用を判定する', () => {
    expect(parseRegistrationIntent('配合飼料を繁殖牛群に2袋使った', { recordMode: true })).toEqual({
      kind: 'feed-use',
      feedName: '配合飼料',
      feedQuantity: '2',
      feedUnit: '袋',
      feedTargetType: 'breedingCattleGroup',
    });
  });

  it('AIで記録モードでは個体指定の飼料使用を判定する', () => {
    expect(parseRegistrationIntent('7358番に腹づくりを1.5kg使った', { recordMode: true })).toEqual({
      kind: 'feed-use',
      earTag: '7358',
      feedName: '腹づくり',
      feedQuantity: '1.5',
      feedUnit: 'kg',
      feedTargetType: 'individual',
    });
  });

  it('AIで記録モードではkg入庫を判定する', () => {
    expect(parseRegistrationIntent('ライグラスを500kg入庫、35000円', { recordMode: true })).toEqual({
      kind: 'feed-inbound',
      feedName: 'ライグラス',
      feedQuantity: '500',
      feedUnit: 'kg',
      feedTotalPrice: '35000',
    });
  });

  it('AIで記録モードでは袋入庫と1袋重量を判定する', () => {
    expect(parseRegistrationIntent('腹づくりを10袋入庫、1袋20kg、15000円', { recordMode: true })).toEqual({
      kind: 'feed-inbound',
      feedName: '腹づくり',
      feedQuantity: '10',
      feedUnit: '袋',
      feedTotalPrice: '15000',
      feedBagWeightKg: '20',
    });
  });

  it('登録依頼ではない発情の質問は登録モードにしない', () => {
    expect(parseRegistrationIntent('1234の前回の発情はいつ？')).toBeNull();
  });

  it('耳標番号がない場合は登録モードにしない', () => {
    expect(parseRegistrationIntent('発情を登録して')).toBeNull();
  });
});
