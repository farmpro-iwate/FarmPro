import { describe, expect, it } from 'vitest';
import { formatJapaneseEra, parseJapaneseEra } from './japaneseEra';

describe('Japanese era birthday conversion', () => {
  it('formats western dates as Japanese era dates', () => {
    expect(formatJapaneseEra('2021-04-15')).toBe('令和3年4月15日');
    expect(formatJapaneseEra('2019-05-01')).toBe('令和元年5月1日');
    expect(formatJapaneseEra('1989-01-08')).toBe('平成元年1月8日');
  });

  it('parses Japanese era dates as ISO dates', () => {
    expect(parseJapaneseEra('令和3年4月15日')).toBe('2021-04-15');
    expect(parseJapaneseEra('平成元年1月8日')).toBe('1989-01-08');
    expect(parseJapaneseEra('R3/4/15')).toBe('2021-04-15');
  });

  it('rejects dates outside an era or invalid calendar dates', () => {
    expect(parseJapaneseEra('令和元年4月30日')).toBeNull();
    expect(parseJapaneseEra('平成元年1月7日')).toBeNull();
    expect(parseJapaneseEra('令和3年2月30日')).toBeNull();
  });
});
