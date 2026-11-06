import { describe, expect, it } from 'vitest';
import { findCalfCertificateDuplicates } from './calfCertificateEntry';

describe('子牛証明書の登録済み個体照合', () => {
  it('個体識別番号または子牛台帳の耳標で照合し、記録を変更しない', () => {
    const calves = [{ id: 1, identificationNumber: '0000001234', calfNumber: '0456', name: '確認用子牛' }];
    const before = structuredClone(calves);
    expect(findCalfCertificateDuplicates({ identificationNumber: '００００００１２３４', calfNumber: '' }, calves, []))
      .toMatchObject([{ id: '1', kind: 'calf', url: '/calves/1/edit?source=calf-certificate' }]);
    expect(findCalfCertificateDuplicates({ identificationNumber: '0000005678', calfNumber: '0456' }, calves, [])).toHaveLength(1);
    expect(calves).toEqual(before);
  });
  it.each(['００００−０１２３−４５', ' ００００ ０１２３ ４５ ', '0000-0123-45'])('既存の公的IDの表記を統一して両台帳の重複を検出する: %s', (identificationNumber) => {
    const calves = [{ id: 11, identificationNumber }];
    const cattle = [{ id: 12, identificationNumber }];
    const before = structuredClone({ calves, cattle });
    expect(findCalfCertificateDuplicates({ identificationNumber: '0000012345', calfNumber: '' }, calves, cattle))
      .toMatchObject([{ id: '11', kind: 'calf' }, { id: '12', kind: 'cattle' }]);
    expect({ calves, cattle }).toEqual(before);
  });
  it.each(['０１−２３', ' ０１ ２３ ', '01-23'])('既存の正式耳標の表記を統一して子牛の重複を検出する: %s', (calfNumber) => {
    const calves = [{ id: 21, calfNumber, identificationNumber: '' }];
    const cattle = [{ id: 22, earTag: calfNumber, identificationNumber: '' }];
    expect(findCalfCertificateDuplicates({ identificationNumber: '0000012345', calfNumber: '0123' }, calves, cattle))
      .toMatchObject([{ id: '21', kind: 'calf' }]);
  });
  it('牛台帳は公的10桁だけで照合し、短い耳標や仮番号で別個体を一致扱いしない', () => {
    const cattle = [{ id: 3, identificationNumber: '0000001234', earTag: '0456' }];
    expect(findCalfCertificateDuplicates({ identificationNumber: '0000005678', calfNumber: '0456' }, [], cattle)).toEqual([]);
    expect(findCalfCertificateDuplicates({ identificationNumber: '0000001234', calfNumber: '' }, [], cattle))
      .toMatchObject([{ kind: 'cattle', url: '/cattle/3' }]);
    expect(findCalfCertificateDuplicates({ identificationNumber: '', calfNumber: 'TEMP-1' }, [{ id: 1, calfNumber: 'TEMP-1' }], [])).toEqual([]);
    expect(findCalfCertificateDuplicates({ identificationNumber: '', calfNumber: 'ＴＥＭＰ－１' }, [{ id: 1, calfNumber: 'TEMP-1' }], [])).toEqual([]);
  });
  it('編集対象自身と削除済みを除き、移行済み個体の既存番号維持は新規扱いしない', () => {
    const input = { identificationNumber: '0000001234', calfNumber: '0456' };
    const calves = [{ id: 1, ...input }, { id: 2, ...input, deletedAt: '2026-10-01' }];
    const cattle = [{ id: 4, identificationNumber: input.identificationNumber }];
    expect(findCalfCertificateDuplicates(input, calves, cattle, { id: '1', identificationNumber: input.identificationNumber })).toEqual([]);
    expect(findCalfCertificateDuplicates(input, calves, cattle, { id: '1', identificationNumber: '' })).toHaveLength(1);
  });
});
