import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { medicationHistoryDetail, resolveTreatmentAnimal, TreatmentHistory } from './TreatmentHistory';

const cow = { id: 'cow-fixture', earTag: '0123', identificationNumber: '0000000123', name: '確認牛', birthday: '2022-04-01' };
const calf = { id: 21, calfNumber: '0456', identificationNumber: '0000000456', name: '確認子牛', birthday: '2026-07-01' };
const ledger = { cattle: [cow], calves: [calf] };
const medication = {
  id: 101, recordType: '投薬', targetNumber: '0456', targetName: '確認子牛', treatmentDate: '2026-11-02',
  medicine: '確認用薬品', dosage: '3 mL', withdrawalEndDate: '2026-11-09', progress: '', symptom: '', diagnosis: '',
};

afterEach(cleanup);

describe('治療・投薬の個体照合', () => {
  it('耳標と公的個体識別番号で照合し、対象番号を内部IDとして解釈しない', () => {
    expect(resolveTreatmentAnimal(medication, ledger)).toEqual({ kind: 'calf', animal: calf });
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: cow.earTag }, ledger)).toEqual({ kind: 'cattle', animal: cow });
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: calf.identificationNumber }, ledger)).toEqual({ kind: 'calf', animal: calf });
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: String(calf.id) }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: '456' }, ledger)).toBeNull();
  });

  it('同じ名号だけでは表示せず、矛盾するIDや番号を同じ個体として扱わない', () => {
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: '0999' }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, targetNumber: '' }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, calfId: 99 }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, targetIdentificationNumber: '0000000999' }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, targetType: '成牛' }, ledger)).toBeNull();
  });

  it('両台帳の複数個体が同じ番号を持つ場合は選ばず、明示された公的IDで一意なら照合する', () => {
    const sameTagCow = { ...cow, earTag: calf.calfNumber };
    const ambiguous = { cattle: [sameTagCow], calves: [calf] };
    expect(resolveTreatmentAnimal(medication, ambiguous)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, targetIdentificationNumber: calf.identificationNumber }, ambiguous))
      .toEqual({ kind: 'calf', animal: calf });
  });

  it('旧形式の仮番号は名号も一致する一意な子牛だけに表示する', () => {
    const temporary = { ...calf, calfNumber: 'TEMP-fixture-one' };
    const sibling = { ...calf, id: 22, calfNumber: 'TEMP-fixture-two', name: '別の子牛' };
    const temporaryLedger = { cattle: [cow], calves: [temporary, sibling] };
    const old = { ...medication, targetNumber: '仮-0701' };
    expect(resolveTreatmentAnimal(old, temporaryLedger)).toEqual({ kind: 'calf', animal: temporary });
    expect(resolveTreatmentAnimal({ ...old, targetName: '' }, temporaryLedger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...old, calfId: sibling.id }, temporaryLedger)).toBeNull();
    expect(resolveTreatmentAnimal(old, { ...temporaryLedger, calves: [temporary, { ...sibling, name: temporary.name }] })).toBeNull();
    expect(resolveTreatmentAnimal(old, { cattle: [], calves: [{ ...temporary, temporaryCalfNumber: temporary.calfNumber, calfNumber: '0456' }] }))
      .toMatchObject({ kind: 'calf', animal: { id: calf.id, calfNumber: '0456' } });
  });

  it('削除済み記録・削除確認待ち記録を履歴へ含めない', () => {
    expect(resolveTreatmentAnimal({ ...medication, deletedAt: '2026-11-03' }, ledger)).toBeNull();
    expect(resolveTreatmentAnimal({ ...medication, treatmentSyncDeletePending: true }, ledger)).toBeNull();
  });
});

describe('治療・投薬の読み取り表示', () => {
  it('投薬の薬品・量・休薬日と既存治療を表示し、編集の戻り先を保持する', () => {
    const treatment = { ...medication, id: 102, recordType: '治療', treatmentDate: '2026-11-01', symptom: '確認用症状',
      medicine: '確認用治療薬', dosage: '1 mL', progress: '経過観察' };
    const rows = [treatment, { ...medication, progress: '治療中', symptom: '投薬には不要な症状' }];
    const before = structuredClone(rows);
    render(<MemoryRouter><TreatmentHistory rows={rows} returnTo="/calves/21" /></MemoryRouter>);

    const table = screen.getByRole('table', { name: '治療・投薬の履歴' });
    const medicationRow = screen.getByText('薬品：確認用薬品').closest('tr')!;
    expect(within(medicationRow).getByText('投薬')).toBeInTheDocument();
    expect(within(medicationRow).getByText('投薬量：3 mL')).toBeInTheDocument();
    expect(within(medicationRow).getByText('2026-11-09')).toBeInTheDocument();
    expect(within(medicationRow).queryByText('治療中')).not.toBeInTheDocument();
    expect(within(medicationRow).queryByText('投薬には不要な症状')).not.toBeInTheDocument();
    expect(within(medicationRow).getByRole('link', { name: '確認・編集' }))
      .toHaveAttribute('href', '/treatments/101/edit?returnTo=%2Fcalves%2F21');
    expect(within(table).getByText('確認用症状')).toBeInTheDocument();
    expect(within(table).getByText('経過観察')).toBeInTheDocument();
    expect(rows).toEqual(before);
  });

  it('子牛履歴は最近5件から展開でき、削除済みを件数に含めない', () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ ...medication, id: index + 1, treatmentDate: `2026-10-0${index + 1}` }));
    rows.push({ ...medication, id: 8, deletedAt: '2026-11-03' } as typeof medication & { deletedAt: string });
    render(<MemoryRouter><TreatmentHistory rows={rows} returnTo="/calves/21" initialLimit={5} canEdit={false} /></MemoryRouter>);
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(screen.queryByText('2026-10-01')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'すべて表示（7件）' }));
    expect(screen.getAllByRole('row')).toHaveLength(8);
    expect(screen.getByText('2026-10-01')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '確認・編集' })).not.toBeInTheDocument();
  });

  it('ストーリーとタイムラインの投薬説明に量と休薬日を含める', () => {
    expect(medicationHistoryDetail(medication)).toBe('薬品：確認用薬品　投薬量：3 mL　休薬終了日：2026-11-09');
    expect(medicationHistoryDetail({ medicine: '確認用薬品', dosage: '3 mL' })).toContain('休薬終了日：未設定');
  });
});
