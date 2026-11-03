import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiRecordFormDraft, type AiRecordFormKind } from '../ai/recordFormDraft';
import { SupplyInventoryForm } from './SupplyInventoryForm';
import { ExpenseForm } from './ExpenseForm';
import { FeedingForm } from './FeedingForm';
import { SalesForm } from './SalesForm';
import { FatteningTransitionForm } from './FatteningTransitionForm';
import * as supplies from '../services/supplyInventoryApi';
import * as expenses from '../services/expensesApi';
import * as feedings from '../services/feedingsApi';
import * as sales from '../services/salesApi';
import * as snapshots from '../services/saleCostSnapshot';
import * as fattening from '../services/fatteningTransitionsApi';
import * as calves from '../services/calfApi';
import * as cattle from '../services/api';
import * as treatments from '../services/treatmentApi';

vi.mock('../components/ExpenseCategorySearchField', () => ({
  ExpenseCategorySearchField: ({ value, onChange, required }: any) =>
    <input aria-label="経費科目" required={required} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ label = '販売先・購買者', value, onChange }: any) =>
    <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('../components/FeedSearchField', () => ({
  FeedSearchField: ({ value, onChange, required }: any) =>
    <input aria-label="飼料名" required={required} value={value} onChange={(event) => onChange(event.target.value)} />,
}));

const owner = { id: 'ai-form-user', farmId: 'ai-form-farm', plan: 'free' };
const sourceText = 'テスト用の入力候補。保存前に内容を確認する。';
const supplyFields = { action: '購入', date: '2026-11-03', itemName: 'テスト薬', quantity: '10.5', unit: '分包', amount: '2500' };
const expenseFields = { paymentDate: '2026-11-03', category: '消耗品費', description: 'テスト用消耗品', amount: '0', target: '農場全体' };
const feedingFields = { feedingDate: '2026-11-03', target: '母牛群', feedName: 'テスト飼料', amount: '2.5', unit: 'kg' };
const saleFields = { targetType: '子牛', targetNumber: '1234', targetName: '候補の子牛', saleDate: '2026-11-03', salePrice: '650000', status: '販売済み' };
const ownerCases: Array<{ kind: AiRecordFormKind; fields: Record<string, string>; path: string; element: ReactElement; button: string }> = [
  { kind: 'medicine-inventory', fields: supplyFields, path: '/supply-inventory/new', element: <SupplyInventoryForm />, button: '内容を確認して保存' },
  { kind: 'expense', fields: expenseFields, path: '/expenses/new', element: <ExpenseForm />, button: '登録' },
  { kind: 'feeding', fields: feedingFields, path: '/feedings/new', element: <FeedingForm />, button: '登録' },
  { kind: 'sale', fields: { ...saleFields, targetType: '成牛' }, path: '/sales/new', element: <SalesForm />, button: '登録する' },
  { kind: 'fattening', fields: { targetNumber: '0456', targetName: 'テスト母牛', startDate: '2026-11-03' }, path: '/fattening-transitions/new', element: <FatteningTransitionForm />, button: '登録する' },
];

function renderDraft(kind: AiRecordFormKind, fields: Record<string, string>, element: ReactElement, path: string, extraFields: Record<string, string> = {}) {
  const draft = createAiRecordFormDraft({ kind, sourceText, fields });
  draft.fields = { ...draft.fields, ...extraFields };
  return render(<MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state: { farmproAiDraft: draft } }]}>
    <Routes>
      <Route path={path.split('?')[0]} element={element} />
      <Route path="*" element={<div>保存先の一覧</div>} />
    </Routes>
  </MemoryRouter>);
}

function expectNoSave() {
  for (const save of [supplies.createSupplyMovement, supplies.changeManualSupplyMovement, expenses.createExpense,
    feedings.createFeeding, sales.createSale, snapshots.getOrCreateSaleCostSnapshot,
    fattening.createFatteningTransition, fattening.updateFatteningTransition, calves.markCalfSold]) {
    expect(save).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  vi.spyOn(supplies, 'createSupplyMovement').mockResolvedValue('new-stock');
  vi.spyOn(supplies, 'changeManualSupplyMovement').mockResolvedValue(undefined);
  vi.spyOn(supplies, 'getSupplyMovements').mockResolvedValue([]);
  vi.spyOn(expenses, 'createExpense').mockResolvedValue({ id: 'new-expense' } as any);
  vi.spyOn(feedings, 'createFeeding').mockResolvedValue({ id: 'new-feeding' } as any);
  vi.spyOn(sales, 'createSale').mockResolvedValue({ id: 'new-sale' } as any);
  vi.spyOn(snapshots, 'getOrCreateSaleCostSnapshot').mockResolvedValue({ productionCost: 0, profit: 0 });
  vi.spyOn(fattening, 'createFatteningTransition').mockResolvedValue({ id: 'new-fattening' } as any);
  vi.spyOn(fattening, 'updateFatteningTransition').mockResolvedValue({ id: 'new-fattening' } as any);
  vi.spyOn(calves, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(calves, 'markCalfSold').mockResolvedValue(undefined as any);
  vi.spyOn(treatments, 'getTreatmentList').mockResolvedValue([]);
  vi.spyOn(cattle, 'getCattleList').mockResolvedValue([
    { id: 51, earTag: '0456', name: 'テスト母牛', sex: '雌' },
  ] as any);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('AI候補から通常の業務フォームへ引き継ぐ', () => {
  it('医薬品の分包と小数を入力候補にし、利用者の編集後に既存APIで1回だけ保存する', async () => {
    const user = userEvent.setup();
    renderDraft('medicine-inventory', supplyFields, <SupplyInventoryForm />, '/supply-inventory/new');

    expect(screen.getByLabelText(/医薬品名/)).toHaveValue('テスト薬');
    expect(screen.getByLabelText(/数量/)).toHaveValue(10.5);
    expect(screen.getByLabelText('単位')).toHaveTextContent('分包');
    expect(screen.getByLabelText('ロット番号（任意）')).not.toBeRequired();
    expect(screen.getByRole('checkbox', { name: /購入費用を経費にも登録/ })).not.toBeChecked();
    expectNoSave();

    await user.clear(screen.getByLabelText(/医薬品名/));
    await user.type(screen.getByLabelText(/医薬品名/), '確認した薬');
    await user.click(screen.getByText('入力した内容を見る'));
    expect(screen.getByText(sourceText)).toBeInTheDocument();
    expect(screen.getByLabelText(/医薬品名/)).toHaveValue('確認した薬');
    await user.click(screen.getByRole('button', { name: '内容を確認して保存' }));

    expect(supplies.createSupplyMovement).toHaveBeenCalledTimes(1);
    expect(supplies.createSupplyMovement).toHaveBeenCalledWith(expect.objectContaining({
      kind: '医薬品', action: '購入', date: '2026-11-03', itemName: '確認した薬', quantity: 10.5, unit: '分包', amount: 2500,
    }), false);
    expect(expenses.createExpense).not.toHaveBeenCalled();
  });

  it('受精卵候補の種類・番号を適用し、購入経費の連動は本人がチェックするまでOFFにする', async () => {
    const user = userEvent.setup();
    renderDraft('embryo-inventory', { ...supplyFields, itemName: 'テスト卵', quantity: '2', unit: '個', lotNumber: 'E-001', sire: 'テスト父牛' },
      <SupplyInventoryForm />, '/supply-inventory/new?kind=医薬品');

    expect(screen.getByLabelText(/受精卵名・品名/)).toHaveValue('テスト卵');
    expect(screen.getByLabelText(/受精卵番号・管理番号/)).toHaveValue('E-001');
    expect(screen.getByLabelText(/受精卵番号・管理番号/)).toBeRequired();
    expectNoSave();
    await user.click(screen.getByRole('checkbox', { name: /購入費用を経費にも登録/ }));
    await user.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    expect(supplies.createSupplyMovement).toHaveBeenCalledWith(expect.objectContaining({ kind: '受精卵', quantity: 2, unit: '個', lotNumber: 'E-001' }), true);
  });

  it('AIで数量が指定されなかった在庫を1個と推測せず、入力されるまで保存しない', async () => {
    const user = userEvent.setup();
    renderDraft('medicine-inventory', { date: '2026-11-03', itemName: 'テスト薬', unit: '本' }, <SupplyInventoryForm />, '/supply-inventory/new');
    const quantity = screen.getByLabelText(/数量/);
    expect(quantity).toHaveValue(0);
    await user.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    expect(quantity).toBeInvalid();
    expectNoSave();
    fireEvent.change(quantity, { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    expect(supplies.createSupplyMovement).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }), false);
  });

  it('在庫の編集画面ではAI候補を無視し、既存レコードだけを編集する', async () => {
    vi.mocked(supplies.getSupplyMovements).mockResolvedValue([{
      id: 'existing-stock', kind: '医薬品', action: '購入', date: '2026-10-20', itemName: '保存済み薬', lotNumber: '', quantity: 4, unit: '本',
      expiryDate: '', supplier: '', storageLocation: '', donorCow: '', sire: '', grade: '', cowEarTag: '', unitPrice: 10, amount: 40,
      paymentMethod: '現金', purchaseReference: '', note: '元のメモ', expenseRecorded: false, createdAt: '', updatedAt: '',
    }]);
    const user = userEvent.setup();
    renderDraft('embryo-inventory', { ...supplyFields, lotNumber: 'AI-LOT', unit: '個' }, <SupplyInventoryForm />, '/supply-inventory/new?editId=existing-stock');
    await waitFor(() => expect(screen.getByLabelText(/医薬品名/)).toHaveValue('保存済み薬'));
    expect(screen.queryByText(/AIの入力候補です/)).not.toBeInTheDocument();
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    expect(supplies.createSupplyMovement).not.toHaveBeenCalled();
    expect(supplies.changeManualSupplyMovement).toHaveBeenCalledWith('existing-stock', expect.objectContaining({ itemName: '保存済み薬', quantity: 4, note: '元のメモ' }));
  });

  it('経費の0円と対象を画面に表示し、確認後だけ保存する', async () => {
    const user = userEvent.setup();
    renderDraft('expense', expenseFields, <ExpenseForm />, '/expenses/new');
    expect(screen.getByLabelText(/金額/)).toHaveValue('0');
    expect(screen.getByLabelText('対象')).toHaveValue('農場全体');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '登録' }));
    expect(expenses.createExpense).toHaveBeenCalledWith(expect.objectContaining(expenseFields));
  });

  it('飼料給与の候補を確認・修正して保存し、原文で編集を上書きしない', async () => {
    const user = userEvent.setup();
    renderDraft('feeding', feedingFields, <FeedingForm />, '/feedings/new');
    expect(screen.getByLabelText(/給与量/)).toHaveValue('2.5');
    expectNoSave();
    await user.clear(screen.getByLabelText(/給与量/));
    await user.type(screen.getByLabelText(/給与量/), '3.75');
    await user.click(screen.getByText('入力した内容を見る'));
    expect(screen.getByLabelText(/給与量/)).toHaveValue('3.75');
    await user.click(screen.getByRole('button', { name: '登録' }));
    expect(feedings.createFeeding).toHaveBeenCalledWith(expect.objectContaining({ ...feedingFields, amount: '3.75' }));
  });

  it('対象未指定の肥育移行は本人が牛台帳から選択し、実際の番号と名号を保存する', async () => {
    const user = userEvent.setup();
    renderDraft('fattening', { startDate: '2026-11-03', startWeight: '620.5' }, <FatteningTransitionForm />, '/fattening-transitions/new');
    expect(screen.getByLabelText('開始時体重 kg')).toHaveValue('620.5');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText('対象牛が設定されていません。')).toBeInTheDocument();
    expectNoSave();
    await user.click(screen.getByLabelText('肥育移行する牛を選択'));
    await user.click(await screen.findByRole('option', { name: 'テスト母牛 / 0456' }));
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(fattening.createFatteningTransition).toHaveBeenCalledWith(expect.objectContaining({
      targetNumber: '0456', targetName: 'テスト母牛', startDate: '2026-11-03', startWeight: '620.5',
    }));
  });

  it('同じ番号の子牛を勝手に決めず、本人が選択した台帳IDで販売と販売済み処理を行う', async () => {
    vi.mocked(calves.getCalfList).mockResolvedValue([
      { id: 'local-91', calfNumber: '1234', name: 'テスト子牛A', sex: '雌', birthday: '2026-01-01', motherName: '母A' },
      { id: 'local-92', calfNumber: '1234', name: 'テスト子牛B', sex: '雄', birthday: '2026-02-02', motherName: '母B' },
    ] as any);
    const user = userEvent.setup();
    renderDraft('sale', saleFields, <SalesForm />, '/sales/new', { calfId: 'forged-draft', cattleId: 'forged-cow' });
    expect(screen.getByLabelText('対象番号')).toHaveValue('1234');
    expect(screen.getByLabelText('区分')).toHaveTextContent('子牛');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(screen.getByText(/対象子牛を台帳から選択するか/)).toBeInTheDocument();
    expectNoSave();
    await user.click(screen.getByLabelText('対象子牛'));
    await user.click(await screen.findByRole('option', { name: /テスト子牛B/ }));
    expect(screen.getByLabelText('対象名')).toHaveValue('テスト子牛B');
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(sales.createSale).toHaveBeenCalledWith(expect.objectContaining({ targetType: '子牛', calfId: 'local-92', cattleId: '', targetNumber: '1234', targetName: 'テスト子牛B', salePrice: '650000' }));
    expect(snapshots.getOrCreateSaleCostSnapshot).toHaveBeenCalledWith({ id: 'new-sale' });
    expect(calves.markCalfSold).toHaveBeenCalledWith('local-92');
  });

  it('個体カルテからの販売登録では既存queryを優先し、AI候補で対象や状態を上書きしない', async () => {
    const user = userEvent.setup();
    renderDraft('sale', saleFields, <SalesForm />,
      '/sales/new?source=calf&targetNumber=9999&targetName=既存リンクの子牛&calfId=ledger-child');
    expect(screen.queryByText(/AIの入力候補です/)).not.toBeInTheDocument();
    expect(screen.getByText('既存リンクの子牛')).toBeInTheDocument();
    expect(screen.getByText('耳標番号：9999')).toBeInTheDocument();
    expect(screen.getByLabelText('販売日')).toHaveValue('');
    expect(screen.getByLabelText('状態')).toHaveTextContent('出荷予定');
    expectNoSave();
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(sales.createSale).toHaveBeenCalledWith(expect.objectContaining({
      targetNumber: '9999', targetName: '既存リンクの子牛', calfId: 'ledger-child', targetType: '子牛', status: '出荷予定', saleDate: '',
    }));
    expect(snapshots.getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
    expect(calves.markCalfSold).not.toHaveBeenCalled();
  });

  it('台帳にない過去の子牛販売は本人の明示選択後だけ記録し、別の子牛を販売済みにしない', async () => {
    const user = userEvent.setup();
    renderDraft('sale', { ...saleFields, saleDate: '2025-11-03' }, <SalesForm />, '/sales/new');
    const unlisted = screen.getByRole('checkbox', { name: '台帳にない子牛として記録する' });
    expect(unlisted).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expectNoSave();
    await user.click(unlisted);
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(sales.createSale).toHaveBeenCalledWith(expect.objectContaining({ calfId: '', cattleId: '', saleDate: '2025-11-03', targetNumber: '1234' }));
    expect(calves.markCalfSold).not.toHaveBeenCalled();
  });

  it.each(ownerCases)('$kind: 候補を開いた後に所有者が変わると保存しない', async ({ kind, fields, path, element, button }) => {
    const user = userEvent.setup();
    renderDraft(kind, fields, element, path);
    expect(screen.getByText(/AIの入力候補です/)).toBeInTheDocument();
    expectNoSave();
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, farmId: 'other-farm' }));
    await user.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByText(/(?:利用者|ログイン).*農場.*変わりました/)).toBeInTheDocument();
    expectNoSave();
  });
});
