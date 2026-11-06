import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesList } from './SalesList';
import { createSale, deleteSale, getSalesList, type SaleRecord } from '../services/salesApi';
import { getExpensesList } from '../services/expensesApi';
import { getOrCreateSaleCostSnapshot } from '../services/saleCostSnapshot';
import { saveManualSettlement } from '../services/manualSettlementSave';
import { readSaleStatementDocument } from '../services/saleStatementDocumentReader';

vi.mock('../services/salesApi', () => ({ getSalesList: vi.fn(), createSale: vi.fn(), deleteSale: vi.fn() }));
vi.mock('../services/expensesApi', () => ({ getExpensesList: vi.fn() }));
vi.mock('../services/saleCostSnapshot', () => ({ getOrCreateSaleCostSnapshot: vi.fn() }));
vi.mock('../services/manualSettlementSave', () => ({ saveManualSettlement: vi.fn() }));
vi.mock('../services/saleStatementDocumentReader', () => ({ readSaleStatementDocument: vi.fn() }));

const sold = {
  id: 'sold-a', status: '販売済み', targetType: '子牛', calfId: '12', targetNumber: '1201',
  targetName: '確認用子牛あ', saleDate: '2026-10-20', salePrice: '110000',
  productionCostSnapshot: 0, profitSnapshot: 110000,
} as SaleRecord;
const anotherSold = { ...sold, id: 'sold-b', calfId: '13', targetNumber: '1202',
  targetName: '確認用子牛い', saleDate: '2026-10-21', salePrice: '120000', profitSnapshot: 120000 };
const planned = { ...sold, id: 'planned', status: '出荷予定', targetNumber: '1203', targetName: '出荷予定の子牛' } as SaleRecord;

function NextPage() {
  const location = useLocation();
  return <div data-testid="next-page">{location.pathname + location.search}</div>;
}
function mount() {
  render(<MemoryRouter initialEntries={['/sales']}><Routes>
    <Route path="/sales" element={<SalesList />} /><Route path="*" element={<NextPage />} />
  </Routes></MemoryRouter>);
}
function expectNoDocumentReadOrSave() {
  expect(readSaleStatementDocument).not.toHaveBeenCalled();
  expect(createSale).not.toHaveBeenCalled();
  expect(deleteSale).not.toHaveBeenCalled();
  expect(saveManualSettlement).not.toHaveBeenCalled();
  expect(getOrCreateSaleCostSnapshot).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSalesList).mockResolvedValue([sold, anotherSold, planned]);
  vi.mocked(getExpensesList).mockResolvedValue([]);
});
afterEach(cleanup);

describe('販売一覧の精算書入力入口', () => {
  it('一覧の検索で隠れた販売済み記録も選べ、新規販売を作らずその精算へ進む', async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '精算書から入力' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '検索・絞り込み' }));
    await user.type(screen.getByLabelText('検索'), sold.targetNumber);
    expect(screen.queryByText(anotherSold.targetName)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    const dialog = screen.getByRole('dialog', { name: '精算書から入力' });
    const next = within(dialog).getByRole('button', { name: 'この販売の精算へ' });
    expect(next).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox', { name: '登録済みの販売' }));
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: '1201 ／ 確認用子牛あ ／ 2026-10-20 ／ 110,000円' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /出荷予定の子牛/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '1202 ／ 確認用子牛い ／ 2026-10-21 ／ 120,000円' }));
    await user.click(next);
    expect(await screen.findByTestId('next-page')).toHaveTextContent('/sales/sold-b/settlement?import=statement');
    expectNoDocumentReadOrSave();
  });

  it('閉じる操作では読み取りも保存も行わず、新規登録は明示した場合だけ開く', async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(screen.getByRole('button', { name: '精算書から入力' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByTestId('next-page')).not.toBeInTheDocument();
    expectNoDocumentReadOrSave();
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '新しい販売を登録' }));
    expect(await screen.findByTestId('next-page')).toHaveTextContent('/sales/new?source=sale-statement');
    expectNoDocumentReadOrSave();
  });
});
