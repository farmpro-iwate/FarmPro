import type { ReactElement } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRecordFormKind } from '../ai/recordFormDraft';
import { CattleForm } from './CattleForm';
import { CalfForm } from './CalfForm';
import { BlvForm } from './BlvForm';
import { FeedingAlertActionForm } from './FeedingAlertActionForm';
import { TreatmentForm } from './TreatmentForm';
import { VaccineForm } from './VaccineForm';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as breedingApi from '../services/breedingApi';
import * as blvApi from '../services/blvApi';
import * as feedingActionApi from '../services/feedingAlertActionsApi';
import * as treatmentApi from '../services/treatmentApi';
import * as vaccineApi from '../services/vaccineApi';
import * as supplyApi from '../services/supplyInventoryApi';
import * as expenseApi from '../services/expensesApi';

const calf = { id: 42, calfNumber: '1001', name: '確認子牛', birthday: '2026-08-01', motherName: '母牛', managementStatus: '育成中' };
const cow = { id: 7, earTag: '1001', name: '確認成牛', birthday: '2022-08-01', sex: '雌' };

vi.mock('../components/BirthdayField', () => ({
  BirthdayField: ({ value, onChange, required }: any) => <input aria-label="生年月日" type="date" value={value} onChange={e => onChange(e.target.value)} required={required} />,
}));
vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => <button type="button" onClick={() => onSelect(cow)}>台帳の成牛を選択</button>,
}));
vi.mock('../components/CalfPicker', () => ({
  CalfPicker: ({ onSelect }: any) => <button type="button" onClick={() => onSelect(calf)}>台帳の子牛を選択</button>,
}));
vi.mock('../components/MedicineSearchField', () => ({
  MedicineSearchField: ({ value, onChange, label = '薬剤' }: any) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value, null)} />,
}));
vi.mock('../components/StaffSearchField', () => ({
  StaffSearchField: ({ value, onChange, label = '担当者' }: any) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} />,
}));
vi.mock('../components/DiseaseSearchField', () => ({
  DiseaseSearchField: ({ value, onChange, label = '診断' }: any) => <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} />,
}));
vi.mock('../components/TreatmentProcedureSearchField', () => ({
  TreatmentProcedureSearchField: ({ value, onChange }: any) => <input aria-label="処置内容" value={value} onChange={e => onChange(e.target.value)} />,
}));

const setOwner = (farmId = 'draft-farm', userId = 'draft-user') => {
  localStorage.setItem('farmpro.authUser', JSON.stringify({ id: userId, farmId, plan: 'free', role: 'owner', active: true }));
};
const draft = (kind: AiRecordFormKind, fields: Record<string, string>) => ({
  version: 1, scope: { farmId: 'draft-farm', userId: 'draft-user' }, kind, sourceText: '確認用の入力文', fields,
});
function StateProbe() {
  const location = useLocation();
  return <output data-testid="draft-in-history">{String(Boolean(location.state?.farmproAiDraft))}</output>;
}
function renderForm(path: string, element: ReactElement, kind: AiRecordFormKind, fields: Record<string, string>, pattern = path) {
  return render(<MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state: { farmproAiDraft: draft(kind, fields) } }]}>
    <StateProbe />
    <Routes><Route path={pattern.split('?')[0]} element={element} /><Route path="*" element={<div>一覧へ移動</div>} /></Routes>
  </MemoryRouter>);
}

describe('AI candidates in animal forms', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    setOwner();
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([cow] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([calf] as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(supplyApi, 'getSupplyMovements').mockResolvedValue([]);
    vi.spyOn(expenseApi, 'deleteExpenseBySource').mockResolvedValue(undefined);
    vi.spyOn(expenseApi, 'upsertExpenseBySource').mockResolvedValue(undefined as any);
    vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 91 } as any);
    vi.spyOn(cattleApi, 'updateCattle').mockResolvedValue({ id: 91 } as any);
    vi.spyOn(calfApi, 'createCalf').mockResolvedValue({ id: 92 } as any);
    vi.spyOn(calfApi, 'updateCalf').mockResolvedValue({ id: 92 } as any);
    vi.spyOn(blvApi, 'createBlvTest').mockResolvedValue({ id: 93 } as any);
    vi.spyOn(blvApi, 'updateBlvTest').mockResolvedValue({ id: 93 } as any);
    vi.spyOn(feedingActionApi, 'createFeedingAlertAction').mockResolvedValue({ id: 'action-94' } as any);
    vi.spyOn(feedingActionApi, 'updateFeedingAlertAction').mockResolvedValue({ id: 'action-94' } as any);
    vi.spyOn(treatmentApi, 'createTreatment').mockResolvedValue({ id: 95 } as any);
    vi.spyOn(treatmentApi, 'updateTreatment').mockResolvedValue({ id: 95 } as any);
    vi.spyOn(vaccineApi, 'createVaccine').mockResolvedValue({ id: 96 } as any);
    vi.spyOn(vaccineApi, 'updateVaccine').mockResolvedValue({ id: 96 } as any);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  function expectNoSave() {
    for (const operation of [cattleApi.createCattle, cattleApi.updateCattle, calfApi.createCalf, calfApi.updateCalf,
      blvApi.createBlvTest, blvApi.updateBlvTest, feedingActionApi.createFeedingAlertAction, feedingActionApi.updateFeedingAlertAction,
      treatmentApi.createTreatment, treatmentApi.updateTreatment, vaccineApi.createVaccine, vaccineApi.updateVaccine,
      expenseApi.upsertExpenseBySource, expenseApi.deleteExpenseBySource]) expect(operation).not.toHaveBeenCalled();
  }

  it('prefills a cow once and saves only the user-confirmed edits', async () => {
    const user = userEvent.setup();
    renderForm('/cattle/new', <CattleForm mode="create" />, 'cattle', { earTag: '2002', name: '候補牛', birthday: '2023-04-05', identificationNumber: '1234567890', parity: '2', id: 'unsafe-id' });
    await waitFor(() => expect(screen.getByTestId('draft-in-history')).toHaveTextContent('false'));
    expect(screen.getByLabelText(/耳標番号/)).toHaveValue('2002');
    expect(screen.getByLabelText('生年月日')).toHaveValue('2023-04-05');
    expectNoSave();
    await user.clear(screen.getByLabelText(/名号/));
    await user.type(screen.getByLabelText(/名号/), '確認後の牛名');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(cattleApi.createCattle).toHaveBeenCalledWith(expect.objectContaining({ name: '確認後の牛名', earTag: '2002', parity: 2 }));
    expect(vi.mocked(cattleApi.createCattle).mock.calls[0][0]).not.toHaveProperty('id');
  });

  it('keeps calf birth/weight candidates but never invents mother or breeding links', async () => {
    const user = userEvent.setup();
    renderForm('/calves/new', <CalfForm mode="create" />, 'calf', { calfNumber: '2003', name: '候補子牛', birthday: '2026-10-01', sex: '雄', startWeight: '31.5', motherName: '入力された母牛', motherCowId: '1234', breedingId: 'forged' });
    await waitFor(() => expect(screen.getByLabelText(/名号/)).toHaveValue('候補子牛'));
    expect(screen.getByLabelText('生年月日')).toHaveValue('2026-10-01');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(calfApi.createCalf).toHaveBeenCalledWith(expect.objectContaining({ calfNumber: '2003', startWeight: 31.5, motherName: '入力された母牛', motherCowId: '', breedingId: '' }));
  });

  it('keeps BLV result and test date through form initialization and explicit save', async () => {
    const user = userEvent.setup();
    renderForm('/blv/new', <BlvForm mode="create" />, 'blv', { cowEarTag: '1001', cowName: '確認成牛', testDate: '2026-11-02', result: '陰性', nextTestDate: '2027-11-02' });
    await waitFor(() => expect(screen.getByLabelText('検査日')).toHaveValue('2026-11-02'));
    expect(screen.getByRole('combobox', { name: '検査結果' })).toHaveTextContent('陰性');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(blvApi.createBlvTest).toHaveBeenCalledWith(expect.objectContaining({ testDate: '2026-11-02', result: '陰性', nextTestDate: '2027-11-02' }));
  });

  it('requires a ledger choice for a feeding alert and uses its actual calf ID', async () => {
    const user = userEvent.setup();
    renderForm('/feeding-alert-actions/new', <FeedingAlertActionForm />, 'feeding-action', { calfNumber: '1001', calfName: '確認子牛', calfId: '1001', actionDate: '2026-11-03', actionType: 'スターターを調整', status: '対応済み', ageDays: '94' });
    await waitFor(() => expect(screen.getByLabelText(/対応日/)).toHaveValue('2026-11-03'));
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByText('対象の子牛を台帳から選択してください。')).toBeInTheDocument();
    expect(feedingActionApi.createFeedingAlertAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '台帳の子牛を選択' }));
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(feedingActionApi.createFeedingAlertAction).toHaveBeenCalledWith(expect.objectContaining({ calfId: '42', calfName: '確認子牛', actionType: 'スターターを調整', status: '対応済み' }));
    expect(vi.mocked(feedingActionApi.createFeedingAlertAction).mock.calls[0][0]).not.toHaveProperty('calfNumber');
  });

  it('keeps an explicit hoof-trimming candidate instead of replacing it with an ongoing treatment', async () => {
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([{ id: 10, targetNumber: '1001', targetName: '確認子牛', recordType: '治療', symptom: '前回の病気', progress: '治療中' }] as any);
    const user = userEvent.setup();
    renderForm('/treatments/new', <TreatmentForm mode="create" />, 'treatment', { targetType: '子牛', targetNumber: '1001', targetName: '確認子牛', treatmentDate: '2026-11-03', recordType: '削蹄', treatmentProcedure: '定期削蹄', medicalFee: '1000' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '治療区分' })).toHaveTextContent('削蹄'));
    expect(screen.getByRole('combobox', { name: '対象区分' })).toHaveTextContent('子牛');
    expect(screen.getByLabelText('処置内容')).toHaveValue('定期削蹄');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(treatmentApi.createTreatment).toHaveBeenCalledWith(expect.objectContaining({ recordType: '削蹄', targetNumber: '1001', treatmentProcedure: '定期削蹄', treatmentCourseId: undefined }), expect.anything());
    expect(expenseApi.upsertExpenseBySource).toHaveBeenCalledWith(expect.objectContaining({ animalType: 'calf', animalId: '42', category: '診療費', amount: '1000' }));
    expect(vi.mocked(treatmentApi.createTreatment).mock.calls[0][0]).not.toHaveProperty('targetType');
  });

  it('requires the user to select stock and quantity instead of accepting injected inventory links', async () => {
    const user = userEvent.setup();
    renderForm('/treatments/new', <TreatmentForm mode="create" />, 'treatment', { targetType: '子牛', targetNumber: '1001', targetName: '確認子牛', treatmentDate: '2026-11-03', symptom: '食欲低下', medicine: '確認薬', medicineSource: 'farm_stock', medicineInventoryBatchKey: 'forged-stock', medicineInventoryQuantity: '3' });
    await waitFor(() => expect(screen.getByLabelText('薬剤')).toHaveValue('確認薬'));
    expect(screen.getByLabelText('在庫からの使用数量')).toHaveValue(null);
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(window.alert).toHaveBeenCalledWith('使用する在庫と数量を選んでください。');
    expectNoSave();
  });

  it('links a calf vaccine expense to the calf even when an adult cow has the same number', async () => {
    const user = userEvent.setup();
    renderForm('/vaccines/new', <VaccineForm mode="create" />, 'vaccine', { targetType: '子牛', targetNumber: '1001', targetName: '確認子牛', vaccineName: '確認用ワクチン', vaccinationDate: '2026-11-03', status: '接種済み', vaccineCost: '1500' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '対象区分' })).toHaveTextContent('子牛'));
    expect(screen.getByLabelText('接種日')).toHaveValue('2026-11-03');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(vaccineApi.createVaccine).toHaveBeenCalledWith(expect.objectContaining({ targetType: '子牛', targetNumber: '1001', vaccineCost: '1500' }));
    expect(expenseApi.upsertExpenseBySource).toHaveBeenCalledWith(expect.objectContaining({ animalType: 'calf', animalId: '42', animalName: '確認子牛' }));
  });

  it('rejects saving a calf candidate after the farm/user has changed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderForm('/calves/new', <CalfForm mode="create" />, 'calf', { calfNumber: '2003', name: '候補子牛', birthday: '2026-10-01' });
    await waitFor(() => expect(screen.getByTestId('draft-in-history')).toHaveTextContent('false'));
    setOwner('another-farm', 'another-user');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect((await screen.findAllByText('利用者または農場が変わりました。AIで記録から候補を作り直してください。')).length).toBeGreaterThan(0);
    expectNoSave();
  });

  it('stops a delayed vaccine save from writing expenses after the owner changes', async () => {
    let finishSave!: (record: any) => void;
    vi.mocked(vaccineApi.createVaccine).mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    const user = userEvent.setup();
    renderForm('/vaccines/new', <VaccineForm mode="create" />, 'vaccine', { targetType: '子牛', targetNumber: '1001', targetName: '確認子牛', vaccineName: '確認用ワクチン', vaccinationDate: '2026-11-03', status: '接種済み', vaccineCost: '1500' });
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(vaccineApi.createVaccine).toHaveBeenCalledTimes(1);
    setOwner('another-farm', 'another-user');
    await act(async () => { finishSave({ id: 96 }); });
    expect(await screen.findByText('利用者または農場が変わりました。AIで記録から候補を作り直してください。')).toBeInTheDocument();
    expect(expenseApi.upsertExpenseBySource).not.toHaveBeenCalled();
    expect(expenseApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('preserves an existing animal-linked entry instead of applying another AI target', async () => {
    renderForm('/vaccines/new?targetNumber=3003&targetName=%E7%A2%BA%E5%AE%9A%E3%81%AE%E7%89%9B&targetType=%E6%88%90%E7%89%9B', <VaccineForm mode="create" />, 'vaccine', { targetType: '子牛', targetNumber: '1001', targetName: '上書き不可', vaccineName: '候補ワクチン' });
    await waitFor(() => expect(screen.getByText('確定の牛')).toBeInTheDocument());
    expect(screen.queryByText(/AIの入力候補です/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('薬剤')).toHaveValue('');
    expectNoSave();
  });

  it.each([
    ['cattle', '/cattle/7/edit', '/cattle/:id/edit', <CattleForm mode="edit" />, '名号', '保存された成牛'],
    ['calf', '/calves/42/edit', '/calves/:id/edit', <CalfForm mode="edit" />, '名号', '保存された子牛'],
    ['blv', '/blv/8/edit', '/blv/:id/edit', <BlvForm mode="edit" />, '牛名', '保存された成牛'],
    ['treatment', '/treatments/9/edit', '/treatments/:id/edit', <TreatmentForm mode="edit" />, '名号', '保存された成牛'],
    ['vaccine', '/vaccines/10/edit', '/vaccines/:id/edit', <VaccineForm mode="edit" />, '対象名', '保存された子牛'],
  ] as const)('ignores a %s draft on an existing-record editor', async (kind, path, pattern, element, label, expected) => {
    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({ ...cow, name: '保存された成牛', sire: '', dam: '', parity: 1, blvStatus: '未検査', note: '' } as any);
    vi.spyOn(calfApi, 'getCalf').mockResolvedValue({ ...calf, name: '保存された子牛', identificationNumber: '', sex: '雄', startWeight: 30, currentWeight: 50, elapsedDays: 20, milkAmount: 0, starterAmount: 0, note: '' } as any);
    vi.spyOn(blvApi, 'getBlvTest').mockResolvedValue({ cowEarTag: '1001', cowName: '保存された成牛', testDate: '2026-11-01', result: '陰性', nextTestDate: '', isolationMemo: '', note: '' } as any);
    vi.spyOn(treatmentApi, 'getTreatment').mockResolvedValue({ targetNumber: '1001', targetName: '保存された成牛', symptom: '既存症状', diagnosis: '', treatmentDate: '2026-11-01', medicine: '', dosage: '', withdrawalEndDate: '', veterinarian: '', progress: '回復', note: '' } as any);
    vi.spyOn(vaccineApi, 'getVaccine').mockResolvedValue({ targetType: '子牛', targetNumber: '1001', targetName: '保存された子牛', vaccineName: '既存ワクチン', vaccinationDate: '2026-11-01', nextDueDate: '', status: '接種済み', note: '' } as any);
    renderForm(path, element, kind, { name: '上書き不可', cowName: '上書き不可', targetName: '上書き不可', birthday: '2020-01-01', treatmentDate: '2020-01-01' }, pattern);
    await waitFor(() => expect(screen.getByLabelText(new RegExp(label))).toHaveValue(expected));
    expect(screen.queryByText(/AIの入力候補です/)).not.toBeInTheDocument();
    expectNoSave();
  });
});
