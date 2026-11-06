import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualSettlementReview } from './ManualSettlementReview';
import * as sales from '../services/salesApi';
import * as expenses from '../services/expensesApi';
import * as settlements from '../services/manualSettlementSave';
import * as plans from '../plans/current-plan';
import { emptySaleStatementCandidate, type SaleStatementCandidate } from '../utils/saleStatementImport';
import { createSaleStatementHandoff } from '../utils/saleStatementHandoff';

const importer = vi.hoisted(() => ({ latest: null as any }));
vi.mock('../components/SaleStatementImport', () => ({
  SaleStatementImport: (props: any) => {
    importer.latest = props;
    return <button disabled={props.disabled} onClick={() => props.onApply(candidate)}>読取候補を反映</button>;
  },
}));
const owner = { id: 'statement-user', farmId: 'statement-farm', plan: 'free' };
const sale = { ...sales.emptySaleInput, id: 'saved-sale', targetType: '子牛', targetNumber: '1201',
  targetName: '確認用子牛', calfId: '12', birthday: '2026-01-02', status: '販売済み',
  salePrice: '110000', saleDate: '2026-10-20' } as sales.SaleRecord;
let candidate: SaleStatementCandidate;
const key = 'farmpro:settlement-draft:statement-farm:saved-sale';
function mount(state?: unknown) {
  render(<MemoryRouter initialEntries={[{ pathname: '/sales/saved-sale/settlement', state }]}>
    <Routes><Route path="/sales/:id/settlement" element={<ManualSettlementReview />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); importer.latest = null;
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  candidate = { ...emptySaleStatementCandidate, documentType: 'sale-settlement', animalCount: '1',
    statementNumber: 'TEST-STATEMENT', saleDate: '2026-10-20', paymentDate: '2026-10-21',
    marketName: '確認用市場', issuerName: '確認用取引先', earTag: '1201', animalName: '確認用子牛',
    grossYen: '110000', deductionTotalYen: '3800', netYen: '106200',
    deductions: [{ label: '確認用手数料', amountYen: '4000' }], adjustments: [{ label: '戻し金', amountYen: '200' }] };
  vi.spyOn(plans, 'getCurrentFarmProPlanId').mockReturnValue('free');
  vi.spyOn(sales, 'getSale').mockResolvedValue(sale);
  vi.spyOn(expenses, 'getExpensesList').mockResolvedValue([]);
  vi.spyOn(expenses, 'retryPendingExpenseSync').mockResolvedValue(0);
  vi.spyOn(settlements, 'getSavedSettlement').mockResolvedValue(null);
  vi.spyOn(settlements, 'saveManualSettlement').mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('精算書候補を既存の販売精算で確認する', () => {
  it('候補反映は一時入力だけで、返金を新規経費にしない', async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '読取候補を反映' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    expect(screen.getByLabelText('精算番号')).toHaveValue('TEST-STATEMENT');
    expect(screen.getByLabelText('差引精算額（円）')).toHaveValue('106200');
    expect(screen.getByLabelText('調整額（加算は＋、減算は－）')).toHaveValue('200');
    expect(screen.getByLabelText('控除額（税込円）')).toHaveValue('4000');
    expect(settlements.saveManualSettlement).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(key) || '{}')).toMatchObject({ net: '106200', adjustment: '200', rows: [{ amount: '4000', expenseId: '' }] });
  });
  it('正式保存のボタンと確認の後だけ、既存保存処理へ1回渡す', async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '読取候補を反映' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    const save = screen.getByRole('button', { name: '内容を確認して正式保存' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(settlements.saveManualSettlement).toHaveBeenCalledTimes(1);
    expect(settlements.saveManualSettlement).toHaveBeenCalledWith(expect.objectContaining({
      saleId: sale.id, grossYen: 110000, expectedNetYen: 106200, adjustmentYen: 200, confirmed: true,
      deductions: [{ label: '確認用手数料', amountYen: 4000, existingExpenseId: undefined }],
      expensesToCreate: [expect.objectContaining({ amount: '4000', description: '確認用手数料' })],
    }));
  });
  it('入力済みの一時明細は勝手に置き換えず、明示反映を待つ', async () => {
    sessionStorage.setItem(key, JSON.stringify({ saleNumber: sale.targetNumber, number: 'HAND-WRITTEN', net: '109000',
      adjustment: '0', paymentDate: '2026-10-21', vendor: '手入力の取引先',
      rows: [{ label: '手入力の明細', amount: '1000', expenseId: '', category: 'その他' }] }));
    const state = { farmproSaleStatement: createSaleStatementHandoff(candidate, owner, sale) };
    const user = userEvent.setup(); mount(state);
    await screen.findByText(/前回の入力を復元しました/);
    expect(screen.getByLabelText('精算番号')).toHaveValue('HAND-WRITTEN');
    expect(importer.latest.autoOpen).toBe(false);
    expect(importer.latest.initialCandidate).toEqual(candidate);
    expect(importer.latest.applyLabel).toBe('入力中の精算を置き換える');
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    expect(screen.getByLabelText('精算番号')).toHaveValue('TEST-STATEMENT');
    expect(settlements.saveManualSettlement).not.toHaveBeenCalled();
  });
  it.each(['番号', '販売日', '販売額'])('既存販売と%sが異なる候補は入力欄に反映しない', async (kind) => {
    candidate = { ...candidate,
      ...(kind === '番号' ? { earTag: '1202' } : kind === '販売日' ? { saleDate: '2026-10-19' } : { grossYen: '120000', netYen: '116200' }),
    };
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '読取候補を反映' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    expect(await screen.findByText(/一致しません/)).toBeInTheDocument();
    expect(screen.getByLabelText('精算番号')).toHaveValue('');
    expect(settlements.saveManualSettlement).not.toHaveBeenCalled();
  });
  it('保存確認中に農場が変わった場合も正式保存しない', async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '読取候補を反映' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    vi.mocked(window.confirm).mockImplementation(() => {
      localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, farmId: 'different-farm' })); return true;
    });
    await user.click(screen.getByRole('button', { name: '内容を確認して正式保存' }));
    expect(await screen.findByText(/ログイン中の農場が変わりました/)).toBeInTheDocument();
    expect(settlements.saveManualSettlement).not.toHaveBeenCalled();
  });
  it('精算登録済みなら取り込み入口を表示しない', async () => {
    vi.mocked(settlements.getSavedSettlement).mockResolvedValue({ id: 'marker', saleId: sale.id,
      settlementNumber: 'DONE', expectedNetYen: 106200 });
    mount();
    await screen.findByText(/この販売は精算登録済みです/);
    expect(screen.queryByRole('button', { name: '読取候補を反映' })).not.toBeInTheDocument();
  });
});
