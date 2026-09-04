import { describe, expect, it } from 'vitest';
import { createSale, emptySaleInput } from './salesApi';

describe('sales status date validation', () => {
  it('販売済みで販売日がない場合は保存できない', async () => {
    await expect(createSale({
      ...emptySaleInput,
      targetName: 'テスト子牛',
      status: '販売済み',
      saleDate: '',
    })).rejects.toThrow('販売済みにする場合は、販売日を入力してください。');
  });

  it('出荷済みで出荷日がない場合は保存できない', async () => {
    await expect(createSale({
      ...emptySaleInput,
      targetName: 'テスト子牛',
      status: '出荷済み',
      shippingDate: '',
    })).rejects.toThrow('出荷済みにする場合は、出荷日を入力してください。');
  });
});
