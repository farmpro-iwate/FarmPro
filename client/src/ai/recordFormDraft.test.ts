import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import {
  AI_RECORD_FORM_DEFINITIONS, assertAiRecordFormDraftOwner, createAiRecordFormDraft,
  getAiRecordFormValues, readAiRecordFormDraft, type AiRecordFormCandidate,
} from './recordFormDraft';

function owner(farmId = 'draft-test-farm', userId = 'draft-test-user') {
  localStorage.setItem('farmpro.authUser', JSON.stringify({ id: userId, farmId, plan: 'free' }));
}
const candidate: AiRecordFormCandidate = { kind: 'medicine-inventory', sourceText: '試験薬を購入', fields: { itemName: '試験薬', quantity: '10.5', unit: '分包', amount: '0' } };
beforeEach(() => { localStorage.clear(); owner(); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('AI record form draft boundaries', () => {
  it('uses only new-record destinations and excludes record identity, sync and expense-link controls', () => {
    expect(AI_RECORD_FORM_DEFINITIONS).toHaveLength(12);
    expect(new Set(AI_RECORD_FORM_DEFINITIONS.map(item => item.kind)).size).toBe(12);
    for (const item of AI_RECORD_FORM_DEFINITIONS) {
      expect(item.route.split('?')[0]).toMatch(/\/new$/);
      expect(Object.keys(item.fields).filter(key => /(?:Id|^id$|Sync|recordExpense|expenseRecorded|sourceType|BatchKey)/.test(key))).toEqual([]);
    }
  });

  it('round-trips the allowed fields only for their original owner and kind', () => {
    const draft = createAiRecordFormDraft(candidate);
    expect(readAiRecordFormDraft({ farmproAiDraft: draft }, ['medicine-inventory', 'embryo-inventory'])).toEqual(draft);
    expect(readAiRecordFormDraft({ farmproAiDraft: draft }, 'expense')).toBeNull();
    owner('another-farm');
    expect(readAiRecordFormDraft({ farmproAiDraft: draft }, 'medicine-inventory')).toBeNull();
    expect(() => assertAiRecordFormDraftOwner(draft)).toThrow('利用者または農場が変わりました');
    owner('draft-test-farm', 'another-user');
    expect(readAiRecordFormDraft({ farmproAiDraft: draft }, 'medicine-inventory')).toBeNull();
    expect(() => getAiRecordFormValues(draft)).toThrow('利用者または農場が変わりました');
    owner();
    localStorage.setItem('farmpro.authToken', 'replacement-test-token');
    expect(readAiRecordFormDraft({ farmproAiDraft: draft }, 'medicine-inventory')).toEqual(draft);
  });

  it('requires a known farm and user instead of using an anonymous shared scope', () => {
    localStorage.clear();
    expect(() => createAiRecordFormDraft(candidate)).toThrow('利用者と農場を確認できません');
    expect(() => assertAiRecordFormDraftOwner(null)).not.toThrow();
    expect(getAiRecordFormValues(null)).toEqual({});
  });

  it('keeps monetary zero and decimal quantities, converting only numeric form values', () => {
    expect(getAiRecordFormValues(createAiRecordFormDraft(candidate))).toEqual({ itemName: '試験薬', quantity: 10.5, unit: '分包', amount: 0 });
    expect(getAiRecordFormValues(createAiRecordFormDraft({ kind: 'expense', sourceText: '経費0円', fields: { amount: '0', description: '無料点検' } }))).toEqual({ amount: '0', description: '無料点検' });
  });

  it('drops IDs, expense controls, invalid enums and inherited fields without changing the source object', () => {
    const fields = Object.assign(Object.create({ itemName: 'inherited-name' }), {
      quantity: '2.5', unit: 'kg', action: '自動同期', id: 'existing-row', farmId: 'other-farm',
      sourceSupplyMovementId: 'linked', recordExpense: 'true', expenseRecorded: 'true', cloudSyncPending: 'false',
    });
    const draft = createAiRecordFormDraft({ ...candidate, fields });
    expect(draft.fields).toEqual({ quantity: '2.5' });
    expect(fields.id).toBe('existing-row');
    expect(fields.unit).toBe('kg');
  });

  it('preserves animal hints for review while excluding them from the saved form object', () => {
    const action = createAiRecordFormDraft({ kind: 'feeding-action', sourceText: '子牛1234の給与対応', fields: { calfNumber: '1234', calfId: 'forged-id', calfName: '試験子牛' } });
    expect(action.fields).toEqual({ calfNumber: '1234', calfName: '試験子牛' });
    expect(getAiRecordFormValues(action)).toEqual({ calfName: '試験子牛' });
    const treatment = createAiRecordFormDraft({ kind: 'treatment', sourceText: '子牛の処置', fields: { targetType: '子牛', targetNumber: '1234', medicineInventoryBatchKey: 'forged-key' } });
    expect(treatment.fields.targetType).toBe('子牛');
    expect(getAiRecordFormValues(treatment)).toEqual({ targetNumber: '1234' });
  });

  it.each(['-1', 'NaN', 'Infinity', '1e309', '1,2', '0x10', ''])('does not copy invalid or negative numbers: %s', value => {
    const draft = createAiRecordFormDraft({ ...candidate, fields: { quantity: value, amount: value, itemName: '試験薬' } });
    expect(draft.fields).toEqual({ itemName: '試験薬' });
  });

  it('accepts actual calendar dates and rejects impossible dates and timestamps', () => {
    const valid = createAiRecordFormDraft({ ...candidate, fields: { date: '2024-02-29', expiryDate: '2026-11-03' } });
    expect(valid.fields).toEqual({ date: '2024-02-29', expiryDate: '2026-11-03' });
    const invalid = createAiRecordFormDraft({ ...candidate, fields: { date: '2026-02-29', expiryDate: '2026-11-03T00:00:00Z' } });
    expect(invalid.fields).toEqual({});
  });

  it('limits text and source size without fabricating replacement content', () => {
    expect(createAiRecordFormDraft({ ...candidate, fields: { itemName: 'x'.repeat(201), note: 'n'.repeat(2001), lotNumber: 'ok' } }).fields).toEqual({ lotNumber: 'ok' });
    expect(() => createAiRecordFormDraft({ ...candidate, sourceText: 'x'.repeat(2001) })).toThrow('2000文字以内');
    expect(createAiRecordFormDraft({ ...candidate, fields: { itemName: 'bad\u0000name' } }).fields).toEqual({});
  });

  it.each([null, [], { farmproAiDraft: [] }, { farmproAiDraft: { version: 2 } },
    { farmproAiDraft: { version: 1, kind: 'medicine-inventory', sourceText: '', fields: [], scope: { farmId: 'draft-test-farm', userId: 'draft-test-user' } } },
    { farmproAiDraft: { version: 1, kind: 'new-kind', sourceText: '', fields: {}, scope: { farmId: 'draft-test-farm', userId: 'draft-test-user' } } },
  ])('ignores malformed router state: %j', state => {
    expect(readAiRecordFormDraft(state, 'medicine-inventory')).toBeNull();
  });

  it('revalidates a changed payload and performs no HTTP or persistence writes', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const database = vi.spyOn(indexedDB, 'open');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const draft = createAiRecordFormDraft(candidate);
    const tampered = { ...draft, fields: { ...draft.fields, id: 'other-row', quantity: '-5', action: 'invalid' } };
    const read = readAiRecordFormDraft({ farmproAiDraft: tampered }, 'medicine-inventory');
    expect(getAiRecordFormValues(read)).toEqual({ itemName: '試験薬', unit: '分包', amount: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(database).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
