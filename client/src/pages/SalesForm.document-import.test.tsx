import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesForm } from './SalesForm';
import * as sales from '../services/salesApi';
import * as snapshots from '../services/saleCostSnapshot';
import * as calves from '../services/calfApi';
import * as treatments from '../services/treatmentApi';
import { emptySaleStatementCandidate, type SaleStatementCandidate } from '../utils/saleStatementImport';
import { readSaleStatementHandoff } from '../utils/saleStatementHandoff';

vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange }: any) => <input aria-label="販売先・購買者" value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('../components/SaleStatementImport', () => ({
  SaleStatementImport: ({ onApply, disabled }: any) => <button type="button" disabled={disabled} onClick={() => onApply(candidate)}>読取候補を反映</button>,
}));

const owner = { id: 'statement-user', farmId: 'statement-farm', plan: 'free' };
const testCalf = { id: 12, calfNumber: '1201', name: '台帳の確認用子牛', birthday: '2026-01-02', sex: '雌', identificationNumber: '0000001201' };
let candidate: SaleStatementCandidate;
const created = { ...sales.emptySaleInput, id: 'saved-sale', targetType: '子牛', targetNumber: '1201',
  targetName: testCalf.name, calfId: '12', birthday: testCalf.birthday, status: '販売済み',
  salePrice: '110000', saleDate: '2026-10-20' } as sales.SaleRecord;
function NextPage() {
  const location = useLocation();
  return <div data-testid="next-page">{JSON.stringify({ path: location.pathname, state: location.state })}</div>;
}
function mount() {
  const query = new URLSearchParams({ source: 'calf', targetNumber: '1201', targetName: testCalf.name,
    calfId: '12', birthday: testCalf.birthday, sex: '雌' });
  render(<MemoryRouter initialEntries={[`/sales/new?${query}`]}><Routes>
    <Route path="/sales/new" element={<SalesForm />} /><Route path="*" element={<NextPage />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  candidate = { ...emptySaleStatementCandidate, documentType: 'sale-settlement', animalCount: '1',
    statementNumber: 'TEST-STATEMENT', saleDate: '2026-10-20', paymentDate: '2026-10-21',
    marketName: '確認用市場', issuerName: '確認用取引先', animalName: '書類の名号候補', earTag: '1201',
    identificationNumber: '0000001201', grossYen: '110000', deductionTotalYen: '3800', netYen: '106200',
    deductions: [{ label: '確認用手数料', amountYen: '4000' }], adjustments: [{ label: '戻し金', amountYen: '200' }] };
  vi.spyOn(calves, 'getCalfList').mockResolvedValue([testCalf] as any);
  vi.spyOn(calves, 'markCalfSold').mockResolvedValue(undefined as any);
  vi.spyOn(treatments, 'getTreatmentList').mockResolvedValue([]);
  vi.spyOn(sales, 'createSale').mockResolvedValue(created);
  vi.spyOn(sales, 'getSalesList').mockResolvedValue([]);
  vi.spyOn(snapshots, 'getOrCreateSaleCostSnapshot').mockResolvedValue({ productionCost: 0, profit: 110000 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('精算書から新規販売への確認付き入力', () => {
  it('候補反映だけでは正式保存せず、選択した牛の情報も書き換えない', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    expect(screen.getByLabelText('販売金額 円')).toHaveValue('110000');
    expect(screen.getByLabelText('市場名')).toHaveValue('確認用市場');
    expect(screen.getByText(testCalf.name)).toBeInTheDocument();
    expect(sales.createSale).not.toHaveBeenCalled();
    expect(calves.markCalfSold).not.toHaveBeenCalled();
    expect(snapshots.getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
  });
  it('利用者が販売登録を押した時だけ一度保存し、同じ販売の精算へ候補を渡す', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    await user.click(screen.getByRole('button', { name: '販売を登録して精算へ' }));
    const next = JSON.parse((await screen.findByTestId('next-page')).textContent || '{}');
    expect(sales.createSale).toHaveBeenCalledTimes(1);
    expect(sales.createSale).toHaveBeenCalledWith(expect.objectContaining({ targetName: testCalf.name, calfId: '12', salePrice: '110000', saleDate: '2026-10-20', status: '販売済み' }));
    expect(calves.markCalfSold).toHaveBeenCalledWith('12');
    expect(next.path).toBe('/sales/saved-sale/settlement');
    expect(readSaleStatementHandoff(next.state, owner, created)).toEqual(candidate);
  });
  it('読取後に農場が変わった場合は販売を保存しない', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, farmId: 'different-farm' }));
    await user.click(screen.getByRole('button', { name: '販売を登録して精算へ' }));
    expect(await screen.findByText(/ログイン中の農場が変わりました/)).toBeInTheDocument();
    expect(sales.createSale).not.toHaveBeenCalled();
  });
  it('同じ牛と販売日の記録があれば、新しい販売を作らず既存精算へ案内する', async () => {
    vi.mocked(sales.getSalesList).mockResolvedValue([created]);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    await user.click(screen.getByRole('button', { name: '販売を登録して精算へ' }));
    expect(await screen.findByText(/同じ牛・販売日の販売記録があります/)).toBeInTheDocument();
    expect(sales.createSale).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: /の販売精算を開く/ }));
    const next = JSON.parse((await screen.findByTestId('next-page')).textContent || '{}');
    expect(next.path).toBe('/sales/saved-sale/settlement');
    expect(readSaleStatementHandoff(next.state, owner, created)).toEqual(candidate);
  });
  it('販売額を候補と違う額へ変えた場合は再確認を求める', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    fireEvent.change(screen.getByLabelText('販売金額 円'), { target: { value: '120000' } });
    await user.click(screen.getByRole('button', { name: '販売を登録して精算へ' }));
    expect(await screen.findByText(/対象の牛・販売日・販売金額・状態が変わっています/)).toBeInTheDocument();
    expect(sales.createSale).not.toHaveBeenCalled();
  });
  it('販売保存後の後処理が失敗しても再登録を許可しない', async () => {
    vi.mocked(snapshots.getOrCreateSaleCostSnapshot).mockRejectedValue(new Error('snapshot unavailable'));
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    await user.click(screen.getByRole('button', { name: '販売を登録して精算へ' }));
    await screen.findByText(/販売記録は保存済みです。続きの処理/);
    expect(screen.getByRole('button', { name: '販売を登録して精算へ' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('button', { name: '販売を登録して精算へ' }).closest('form')!);
    expect(sales.createSale).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '保存した販売を確認' })).toHaveAttribute('href', '/sales/saved-sale/edit');
  });
  it('手入力へ戻しても取込時の農場の確認を維持する', async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    await user.click(screen.getByRole('button', { name: '手入力に戻す' }));
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, farmId: 'different-farm' }));
    await user.click(screen.getByRole('button', { name: '登録する' }));
    expect(await screen.findByText(/ログイン中の農場が変わりました/)).toBeInTheDocument();
    expect(sales.createSale).not.toHaveBeenCalled();
  });
  it('別の個体番号の候補を反映しない', async () => {
    candidate = { ...candidate, earTag: '1202', identificationNumber: '0000001202' };
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '読取候補を反映' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '読取候補を反映' }));
    expect(await screen.findByText(/選択した牛の番号が一致しません/)).toBeInTheDocument();
    expect(screen.getByLabelText('販売金額 円')).toHaveValue('');
    expect(sales.createSale).not.toHaveBeenCalled();
  });
});
