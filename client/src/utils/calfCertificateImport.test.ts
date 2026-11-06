import { describe, expect, it } from 'vitest';
import type { CalfInput } from '../types/calf';
import {
  buildCalfCertificatePatch, emptyCalfCertificateCandidate, normalizeCalfCertificateCandidate, normalizeCalfCertificateIdentifier,
  validateCalfCertificateCandidate, validateCalfCertificateForm, type CalfCertificateCandidate,
} from './calfCertificateImport';

function certificate(changes: Partial<CalfCertificateCandidate> = {}): CalfCertificateCandidate {
  return {
    ...emptyCalfCertificateCandidate,
    documentType: 'calf-registration-certificate',
    identificationNumber: '0000012345',
    name: '確認用子牛', birthday: '2026-07-01', sex: '雄',
    sire: '確認用父', dam: '確認用母', notes: [],
    ...changes,
  };
}

function form(changes: Partial<CalfInput> = {}): CalfInput {
  return {
    calfNumber: '', identificationNumber: '', name: '', birthday: '', sex: '雌',
    motherName: '', motherCowId: '', motherCowName: '', breedingMethod: '', breedingId: '',
    recipientCowId: '', recipientCowName: '', geneticMotherCowId: '', geneticMotherCowName: '', sireName: '',
    startWeight: 31, currentWeight: 120, elapsedDays: 90, milkAmount: 4, starterAmount: 2,
    feedingMethod: '混合哺育', weaningPlannedDate: '2026-10-01', weaningDate: '', weaningStatus: '離乳前',
    weaningWeight: 100, weaningStarterAmount: 2, milkEndDate: '',
    managementStatus: '販売予定', note: '既存の備考\n成長記録を保持', ...changes,
  };
}

describe('子牛登録証明書の候補検証', () => {
  it('先頭0と書類の耳標空欄を保持し、番号を補完・末尾から推定しない', () => {
    const raw = certificate({ identificationNumber: ' ００００−０１ ２３－４５ ', birthday: '２０２６-０７-０１' });
    const before = structuredClone(raw);
    const normalized = normalizeCalfCertificateCandidate(raw);
    expect(normalizeCalfCertificateIdentifier(raw.identificationNumber)).toBe('0000012345');
    expect(normalized.identificationNumber).toBe('0000012345');
    expect(normalized.earTag).toBe('');
    expect(normalized.birthday).toBe('2026-07-01');
    expect(validateCalfCertificateCandidate(normalized)).toEqual([]);
    expect(raw).toEqual(before);
  });

  it('不足項目・別用途の追加項目・型違い・長すぎる値を黙って捨てない', () => {
    const valid = certificate();
    const { identificationNumber: _identity, ...missing } = valid;
    for (const invalid of [
      missing, { ...valid, offspring: [] }, { ...valid, identificationNumber: 12345 },
      { ...valid, notes: '確認' }, { ...valid, notes: [1] }, { ...valid, notes: Array(21).fill('確認') },
      { ...valid, name: '名'.repeat(301) }, { ...valid, sex: '不明' }, { ...valid, documentType: 'cattle' },
    ]) expect(() => normalizeCalfCertificateCandidate(invalid)).toThrow(/形式が不正/);
  });

  it.each(['', '000012345', '00000012345', '00000123?5', '00000123A5'])('本人番号を読めないまま反映しない: %s', (identificationNumber) => {
    const checked = certificate({ identificationNumber });
    expect(validateCalfCertificateCandidate(checked)).toEqual(expect.arrayContaining([expect.stringContaining('10桁')]));
    expect(buildCalfCertificatePatch(checked, form()).patch).toBeNull();
  });

  it('実在日と既知の性別を要求し、通常フォームの既定値で不明性別を補わない', () => {
    expect(validateCalfCertificateCandidate(certificate({ birthday: '2024-02-29' }))).toEqual([]);
    for (const birthday of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-07-00', '令和8年7月1日']) {
      expect(validateCalfCertificateCandidate(certificate({ birthday }))).toEqual(expect.arrayContaining([expect.stringContaining('生年月日')]));
    }
    const unknownSex = certificate({ sex: '' });
    expect(normalizeCalfCertificateCandidate(unknownSex).sex).toBe('');
    expect(buildCalfCertificatePatch(unknownSex, form({ sex: '雌' })).patch).toBeNull();
    expect(validateCalfCertificateCandidate(certificate({ documentType: 'other' }))).toEqual(expect.arrayContaining([expect.stringContaining('1頭分')]));
  });

  it('明記された耳標だけを使い、短縮番号や別の番号を自動作成しない', () => {
    expect(normalizeCalfCertificateCandidate(certificate({ earTag: '０１２３' })).earTag).toBe('0123');
    expect(buildCalfCertificatePatch(certificate({ earTag: '0123' }), form()).patch?.calfNumber).toBe('0123');
    for (const earTag of ['12345678901', 'A123', '不明', '123?']) {
      expect(validateCalfCertificateCandidate(certificate({ earTag }))).toEqual(expect.arrayContaining([expect.stringContaining('耳標番号')]));
    }
  });
});

describe('確認済みの基本情報だけを子牛フォームへ反映', () => {
  it('既存備考・成長・哺育・飼養・ライフサイクルを保持する小さなpatchを返す', () => {
    const current = form({ lifecycle: { version: 1, death: {
      date: '2026-10-20', reason: '確認用', note: '', recordedAt: '2026-10-20T00:00:00Z',
    } } });
    const before = structuredClone(current);
    const raw = certificate({ registrationNumber: 'TEST-REG-01', maternalSire: '確認用母の父', maternalGrandSire: '確認用祖母の父',
      notes: ['読み取り時の補足。業務メモへ自動保存しない。'] });
    const checked = buildCalfCertificatePatch(raw, current);
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toEqual([]);
    expect(checked.patch).toEqual({
      identificationNumber: '0000012345', name: '確認用子牛', birthday: '2026-07-01', sex: '雄',
      sireName: '確認用父', motherName: '確認用母', motherCowName: '確認用母',
      note: current.note + '\n登録証明書の登録番号：TEST-REG-01\n登録証明書の母の父：確認用母の父\n登録証明書の祖母の父：確認用祖母の父',
    });
    const merged = { ...current, ...checked.patch };
    expect(merged).toMatchObject({
      currentWeight: 120, startWeight: 31, elapsedDays: 90, feedingMethod: '混合哺育',
      milkAmount: 4, starterAmount: 2, managementStatus: '販売予定', lifecycle: current.lifecycle,
    });
    expect(merged.note).not.toContain('業務メモ');
    expect(current).toEqual(before);
  });

  it('書類で空欄の名号・父母・耳標は、既存情報を消さない', () => {
    const current = form({ calfNumber: '0123', name: '現在の名号', sireName: '現在の父', motherName: '現在の母',
      motherCowName: '現在の母', motherCowId: '0456' });
    const checked = buildCalfCertificatePatch(certificate({ name: '', sire: '', dam: '', earTag: '' }), current);
    expect(checked.errors).toEqual([]);
    expect(checked.patch).toEqual({ identificationNumber: '0000012345', birthday: '2026-07-01', sex: '雄' });
    expect({ ...current, ...checked.patch }).toMatchObject({ calfNumber: '0123', name: '現在の名号', sireName: '現在の父', motherName: '現在の母', motherCowId: '0456' });
  });

  it('別の10桁番号・正式耳標の証明書は拒否し、未装着の仮番号だけ置き換えられる', () => {
    expect(buildCalfCertificatePatch(certificate(), form({ identificationNumber: '0000099999' })).patch).toBeNull();
    expect(buildCalfCertificatePatch(certificate({ earTag: '0123' }), form({ calfNumber: '0999' })).patch).toBeNull();
    const current = form({ calfNumber: 'TEMP-MANUAL-10', identificationNumber: '００００-０１２３-４５' });
    expect(buildCalfCertificatePatch(certificate({ earTag: '0123' }), current).patch?.calfNumber).toBe('0123');
    expect(buildCalfCertificatePatch(certificate({ earTag: '' }), current).patch).not.toHaveProperty('calfNumber');
  });

  it('既存の番号に全角・空白・ハイフンがあっても同じ個体として照合する', () => {
    const current = form({ identificationNumber: '００００−０１ ２３－４５', calfNumber: ' ０１−２３ ' });
    const checked = buildCalfCertificatePatch(certificate({ earTag: '0123' }), current);
    expect(checked.errors).toEqual([]);
    expect(checked.patch).toMatchObject({ identificationNumber: '0000012345', calfNumber: '0123' });
    expect(buildCalfCertificatePatch(certificate({ identificationNumber: '0000099999', earTag: '0123' }), current).patch).toBeNull();
    expect(buildCalfCertificatePatch(certificate({ earTag: '0999' }), current).patch).toBeNull();
  });

  it('親IDに紐付いた異なる母名は変えず、証明書の母名を備考へ一度だけ追記する', () => {
    const current = form({ motherCowId: '0456', motherName: '登録済み母', motherCowName: '登録済み母', breedingId: 'test-breeding' });
    const checked = buildCalfCertificatePatch(certificate(), current);
    expect(checked.errors).toEqual([]);
    expect(checked.warnings).toHaveLength(1);
    expect(checked.patch).not.toHaveProperty('motherName');
    expect(checked.patch).not.toHaveProperty('motherCowName');
    expect(checked.patch).not.toHaveProperty('motherCowId');
    expect(checked.patch?.note).toBe(current.note + '\n登録証明書の母牛名：確認用母');
    const repeated = buildCalfCertificatePatch(certificate(), { ...current, ...checked.patch });
    expect(repeated.patch).not.toHaveProperty('note');
    expect({ ...current, ...checked.patch, ...repeated.patch }.note).toBe(checked.patch?.note);
  });

  it('関連のある母牛名が空欄・別aliasと不一致の場合も推測して変えない', () => {
    for (const current of [
      form({ motherCowId: '0456' }),
      form({ breedingId: 'test-breeding' }),
      form({ motherCowId: '0456', motherName: '確認用母', geneticMotherCowName: '別の母' }),
    ]) {
      const checked = buildCalfCertificatePatch(certificate(), current);
      expect(checked.patch).not.toHaveProperty('motherName');
      expect(checked.patch?.note).toContain('登録証明書の母牛名：確認用母');
      expect(checked.warnings).toHaveLength(1);
    }
  });

  it('ETの血統上の母だけを反映し、代理母・父母ID・種付方法や記録を変更しない', () => {
    const current = form({
      breedingMethod: '受精卵移植', breedingId: 'test-et', recipientCowId: '0789', recipientCowName: '確認用代理母',
      geneticMotherCowId: '0456', geneticMotherCowName: '確認用母', motherCowId: '0456',
      motherName: '確認用母', motherCowName: '確認用母',
    });
    const checked = buildCalfCertificatePatch(certificate(), current);
    expect(checked.warnings).toEqual([]);
    expect(checked.patch).toMatchObject({ motherName: '確認用母', motherCowName: '確認用母', geneticMotherCowName: '確認用母' });
    for (const key of ['recipientCowId', 'recipientCowName', 'motherCowId', 'geneticMotherCowId', 'breedingMethod', 'breedingId']) {
      expect(checked.patch).not.toHaveProperty(key);
    }
    expect({ ...current, ...checked.patch }).toMatchObject({
      recipientCowId: '0789', recipientCowName: '確認用代理母', geneticMotherCowId: '0456',
      breedingId: 'test-et', breedingMethod: '受精卵移植',
    });
  });

  it('代理母だけが選ばれているETでも、代理母へ血統上の母名を代入しない', () => {
    const current = form({ breedingMethod: '受精卵移植', recipientCowId: '0789', recipientCowName: '確認用代理母' });
    const checked = buildCalfCertificatePatch(certificate(), current);
    expect(checked.warnings).toEqual([]);
    expect(checked.patch?.geneticMotherCowName).toBe('確認用母');
    expect(checked.patch).not.toHaveProperty('recipientCowName');
    expect(checked.patch).not.toHaveProperty('geneticMotherCowId');
  });

  it('反映後に利用者が編集した番号・生日・性別を保存直前に再確認する', () => {
    const current = form();
    const merged = { ...current, ...buildCalfCertificatePatch(certificate(), current).patch };
    expect(validateCalfCertificateForm(merged)).toEqual([]);
    expect(validateCalfCertificateForm({ ...merged, calfNumber: 'TEMP-MANUAL-10' })).toEqual([]);
    for (const changes of [
      { identificationNumber: '' }, { identificationNumber: '000012345' }, { identificationNumber: '０００００１２３４５' },
      { birthday: '2026-02-30' }, { sex: '' }, { calfNumber: '123?' },
    ]) expect(validateCalfCertificateForm({ ...merged, ...changes }).length).toBeGreaterThan(0);
  });
});
