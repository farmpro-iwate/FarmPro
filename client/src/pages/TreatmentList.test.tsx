import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentList } from './TreatmentList';
import type { Treatment } from '../types/treatment';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';
import * as authClient from '../services/authClient';
import * as currentPlan from '../plans/current-plan';
import * as repository from '../storage/repository';

const treatment: Treatment = {
  id: 123, targetName: 'はなみつ', targetNumber: '7358', treatmentDate: '2026-09-23',
  recordType: '治療', symptom: '症状', diagnosis: '', treatmentProcedure: '',
  medicine: '薬剤', dosage: '', withdrawalEndDate: '', veterinarian: '', progress: '経過観察', note: '',
};
const expense: expensesApi.ExpenseRecord = {
  id: 'fee-123', sourceType: 'treatment', sourceId: '123', category: '診療費',
  paymentDate: '2026-09-23', description: '治療費', vendor: '', amount: '2000',
  paymentMethod: '現金', target: 'はなみつ', memo: '', createdAt: '', updatedAt: '',
};
const authUser: authClient.AuthUser = {
  id: 'user-test', farmId: 'farm-test', farmName: '試験農場', name: '利用者',
  role: 'owner', active: true, plan: 'standard',
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function expenseResponse(records: expensesApi.ExpenseRecord[]): Response {
  return new Response(JSON.stringify(records), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function showList() {
  const user = userEvent.setup();
  render(<MemoryRouter><TreatmentList /></MemoryRouter>);
  expect(await screen.findAllByText('はなみつ')).not.toHaveLength(0);
  return user;
}

describe('TreatmentList deletion preserves records on failure', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([treatment]);
    vi.spyOn(treatmentApi, 'deleteTreatment').mockResolvedValue(undefined);
    vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => expenseResponse([])));
    vi.spyOn(currentPlan, 'getCurrentFarmProPlanId').mockReturnValue('standard');
    vi.spyOn(repository, 'getAllRecords').mockResolvedValue([]);
    vi.spyOn(authClient, 'getStoredAuthUser').mockReturnValue(authUser);
    vi.spyOn(authClient, 'getAuthToken').mockReturnValue('test-token');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('治療の削除成功を待って関連経費を削除し、待機中の重複操作を防ぐ', async () => {
    const deletion = deferred<void>();
    vi.mocked(treatmentApi.deleteTreatment).mockReturnValue(deletion.promise);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValueOnce([treatment]).mockResolvedValue([]);
    const user = await showList();

    await user.dblClick(screen.getAllByRole('button', { name: '削除' })[0]);
    await waitFor(() => expect(treatmentApi.deleteTreatment).toHaveBeenCalledOnce());
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    screen.getAllByRole('button', { name: '削除中…' }).forEach((button) => expect(button).toBeDisabled());
    expect(window.confirm).toHaveBeenCalledOnce();

    await act(async () => { deletion.resolve(); });
    await screen.findByText('表示：0件 / 全0件');
    expect(expensesApi.deleteExpenseBySource).toHaveBeenNthCalledWith(1, 'treatment', '123', '医薬品費');
    expect(expensesApi.deleteExpenseBySource).toHaveBeenNthCalledWith(2, 'treatment', '123', '診療費');
  });

  it('治療削除の失敗を表示し、治療と経費を残して同じ削除操作から再試行できる', async () => {
    vi.mocked(treatmentApi.deleteTreatment).mockRejectedValueOnce(new Error('削除を確認できませんでした。端末の記録を保持しています。'));
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('端末の記録を保持しています');
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    expect(screen.getAllByText('はなみつ')).not.toHaveLength(0);
    screen.getAllByRole('button', { name: '削除' }).forEach((button) => expect(button).toBeEnabled());

    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([]);
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await screen.findByText('表示：0件 / 全0件');
    expect(treatmentApi.deleteTreatment).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('端末に精算確定済みの関連経費があれば、治療も経費も削除しない', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([{ ...expense, settlementSaleId: 'sale-final' }]);
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('精算確定済みの関連経費');
    expect(treatmentApi.deleteTreatment).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('関連経費がある場合は最新の精算状態を確認し、別端末での精算確定を保護する', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([expense]);
    vi.mocked(fetch).mockResolvedValue(expenseResponse([{ ...expense, settlementSaleId: 'sale-final' }]));
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('精算確定済みの関連経費');
    expect(fetch).toHaveBeenCalledWith('/api/expenses/record-sync', expect.objectContaining({
      headers: { Authorization: 'Bearer test-token' }, cache: 'no-store',
    }));
    expect(treatmentApi.deleteTreatment).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('関連経費の確認に失敗した場合は治療削除へ進まず、記録を残す', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([expense]);
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('治療記録は削除していません');
    expect(treatmentApi.deleteTreatment).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('別の元記録や詳細に属する精算済み経費は、今回の削除対象にしない', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([
      { ...expense, settlementSaleId: 'sale-final', sourceId: 'other' },
      { ...expense, settlementSaleId: 'sale-final', sourceType: 'breeding' },
      { ...expense, settlementSaleId: 'sale-final', sourceDetail: 'separate-detail' },
    ]);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValueOnce([treatment]).mockResolvedValue([]);
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    await screen.findByText('表示：0件 / 全0件');
    expect(treatmentApi.deleteTreatment).toHaveBeenCalledWith(123);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['farm', 'user', 'token'] as const)('精算確認の待機中に %s が変わったら削除へ進まない', async (field) => {
    const checking = deferred<Response>();
    vi.mocked(repository.getAllRecords).mockResolvedValue([expense]);
    vi.mocked(fetch).mockReturnValue(checking.promise);
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    if (field === 'farm') vi.mocked(authClient.getStoredAuthUser).mockReturnValue({ ...authUser, farmId: 'another-farm' });
    if (field === 'user') vi.mocked(authClient.getStoredAuthUser).mockReturnValue({ ...authUser, id: 'another-user' });
    if (field === 'token') vi.mocked(authClient.getAuthToken).mockReturnValue('another-token');
    await act(async () => { checking.resolve(expenseResponse([expense])); });

    expect(await screen.findByRole('alert')).toHaveTextContent('農場またはログイン状態が変わった');
    expect(treatmentApi.deleteTreatment).not.toHaveBeenCalled();
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('治療削除の応答待ちでログイン状態が変わったら関連経費へ進まない', async () => {
    const deletion = deferred<void>();
    vi.mocked(treatmentApi.deleteTreatment).mockReturnValue(deletion.promise);
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await waitFor(() => expect(treatmentApi.deleteTreatment).toHaveBeenCalledOnce());

    vi.mocked(authClient.getAuthToken).mockReturnValue('another-token');
    await act(async () => { deletion.resolve(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('農場またはログイン状態が変わった');
    expect(expensesApi.deleteExpenseBySource).not.toHaveBeenCalled();
  });

  it('経費だけ失敗した場合は段階を表示し、治療を削除し直さず経費だけ再試行する', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([expense]);
    vi.mocked(fetch).mockImplementation(async () => expenseResponse([expense]));
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValueOnce([treatment]).mockResolvedValue([]);
    vi.mocked(expensesApi.deleteExpenseBySource).mockRejectedValueOnce(new Error('offline'));
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('治療記録の削除は完了しましたが、関連経費の削除を完了できませんでした');
    expect(screen.getByRole('alert')).toHaveTextContent('再読み込み後も経費一覧に残ります');
    expect(screen.getByRole('link', { name: '経費一覧' })).toHaveAttribute('href', '/expenses');
    await screen.findByText('表示：0件 / 全0件');
    expect(expensesApi.deleteExpenseBySource).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: '関連経費の削除を再試行' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(treatmentApi.deleteTreatment).toHaveBeenCalledOnce();
    expect(expensesApi.deleteExpenseBySource).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it('経費の再試行でも精算確定を再確認して、保護された経費を削除しない', async () => {
    vi.mocked(repository.getAllRecords).mockResolvedValue([expense]);
    vi.mocked(fetch).mockResolvedValueOnce(expenseResponse([expense]))
      .mockImplementation(async () => expenseResponse([{ ...expense, settlementSaleId: 'sale-final' }]));
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValueOnce([treatment]).mockResolvedValue([]);
    vi.mocked(expensesApi.deleteExpenseBySource).mockRejectedValueOnce(new Error('offline'));
    const user = await showList();
    await user.click(screen.getAllByRole('button', { name: '削除' })[0]);
    await screen.findByText('表示：0件 / 全0件');
    await waitFor(() => expect(screen.getByRole('button', { name: '関連経費の削除を再試行' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: '関連経費の削除を再試行' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(expensesApi.deleteExpenseBySource).toHaveBeenCalledOnce();
    expect(treatmentApi.deleteTreatment).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('関連経費の削除を完了できませんでした');
  });
});
