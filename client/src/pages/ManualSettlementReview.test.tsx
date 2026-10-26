import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ManualSettlementReview } from './ManualSettlementReview';

const { saveMock, saleMock, expenseMock, savedLookupMock, planMock, cloudStatusMock, cloudDetailsMock, cloudPresenceMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  saleMock: vi.fn(),
  expenseMock: vi.fn(),
  savedLookupMock: vi.fn(),
  planMock: vi.fn(() => 'free'),
  cloudStatusMock: vi.fn(),
  cloudDetailsMock: vi.fn(),
  cloudPresenceMock: vi.fn(),
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: planMock }));
vi.mock('../services/cloudSettlementStatus', () => ({ checkCloudSettlementStatus: cloudStatusMock, getCloudSettlementDetails: cloudDetailsMock, checkCloudSalePresence: cloudPresenceMock }));
vi.mock('../services/salesApi', () => ({ getSale: saleMock }));
vi.mock('../services/expensesApi', () => ({ getExpensesList: expenseMock }));
vi.mock('../services/manualSettlementSave', () => ({ saveManualSettlement: saveMock, getSavedSettlement: savedLookupMock }));

const sale = {
  id: 'sale-1', targetName: 'ふくこ', targetNumber: '5953', salePrice: '712800',
  status: '販売済み',
};
const vaccine = {
  id: 'expense-vaccine', description: '五種混合・ヘモフィルスワクチン',
  amount: '3640', paymentDate: '2026-04-21', target: '5953',
};

function show() {
  return render(<MemoryRouter initialEntries={['/sales/sale-1/settlement']}>
    <Routes><Route path="/sales/:id/settlement" element={<ManualSettlementReview />} /></Routes>
  </MemoryRouter>);
}

describe('manual settlement screen', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    planMock.mockReturnValue('free');
    cloudStatusMock.mockResolvedValue({ saleId: 'sale:sale-1', registered: false, saleReady: true, settlementNumber: null });
    cloudDetailsMock.mockResolvedValue(null);
    cloudPresenceMock.mockResolvedValue('present');
    saleMock.mockResolvedValue(sale);
    expenseMock.mockResolvedValue([vaccine]);
    saveMock.mockResolvedValue(undefined);
    savedLookupMock.mockResolvedValue(null);
  });

  it('loads sale and existing expenses without saving anything', async () => {
    show();
    expect(await screen.findByText(/ふくこ（5953）/)).toBeInTheDocument();
    expect(screen.getByText(/販売金額：712800円/)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
  });

  it('refuses save when settlement amount is invalid', async () => {
    show();
    await screen.findByText(/ふくこ（5953）/);
    fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
    fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '999999' } });
    fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '市場手数料' } });
    fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '16394' } });
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });
  it('does not save when user cancels the final confirmation', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '663597' } });
      fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '控除額' } });
      fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '49203' } });
      fireEvent.change(screen.getByLabelText('JA精算日（接種日とは別）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: '新岩手農業協同組合' } });
      const save = screen.getByRole('button', { name: '確認して新規経費を一括登録' });
      expect(save).toBeEnabled();
      fireEvent.click(save);
      expect(confirmMock).toHaveBeenCalledOnce();
      expect(saveMock).not.toHaveBeenCalled();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('saves only new expense on confirmed settlement and blocks second click', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '663597' } });
      fireEvent.change(screen.getByLabelText('控除名'), { target: { value: '控除額' } });
      fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '49203' } });
      fireEvent.change(screen.getByLabelText('JA精算日（接種日とは別）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: '新岩手農業協同組合' } });
      fireEvent.click(screen.getByRole('button', { name: '確認して新規経費を一括登録' }));
      await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
      expect(saveMock.mock.calls[0][0].expensesToCreate).toHaveLength(1);
      expect(saveMock.mock.calls[0][0].expensesToCreate[0].amount).toBe('49203');
      expect(await screen.findByText('新規経費の一括登録が完了しました。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '登録済み' })).toBeDisabled();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('links a recorded vaccine expense without creating a duplicate expense', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '709160' } });
      fireEvent.mouseDown(screen.getByRole('combobox', { name: '登録済み経費と紐づけ（任意）' }));
      fireEvent.click(await screen.findByRole('option', { name: /五種混合・ヘモフィルスワクチン/ }));
      fireEvent.change(screen.getByLabelText('JA精算日（接種日とは別）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: 'JA' } });
      expect(screen.getByText(/登録済み経費：1件 ／ 新規経費候補：0件/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '確認して新規経費を一括登録' }));
      await waitFor(() => expect(saveMock).toHaveBeenCalledOnce());
      expect(saveMock.mock.calls[0][0].deductions[0].existingExpenseId).toBe('expense-vaccine');
      expect(saveMock.mock.calls[0][0].expensesToCreate).toEqual([]);
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('新規経費：0件'));
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('五種混合・ヘモフィルスワクチン：3,640円'));
      expect(confirmMock).toHaveBeenCalledWith(expect.stringContaining('この牛の精算書に属することを確認'));
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('keeps registration disabled if saving succeeds but reading the receipt fails', async () => {
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
    savedLookupMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('readback unavailable'));
    try {
      show();
      await screen.findByText(/ふくこ（5953）/);
      fireEvent.change(screen.getByLabelText('精算番号'), { target: { value: '26025106' } });
      fireEvent.change(screen.getByLabelText('差引精算額（円）'), { target: { value: '663597' } });
      fireEvent.change(screen.getByLabelText('控除名'), { target: { value: 'その他控除' } });
      fireEvent.change(screen.getByLabelText('控除額（税込円）'), { target: { value: '49203' } });
      fireEvent.change(screen.getByLabelText('JA精算日（接種日とは別）'), { target: { value: '2026-04-21' } });
      fireEvent.change(screen.getByLabelText('支払先'), { target: { value: 'JA' } });
      fireEvent.click(screen.getByRole('button', { name: '確認して新規経費を一括登録' }));
      expect(await screen.findByText(/登録は完了しましたが、保存内容を読み直せませんでした/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '登録済み' })).toBeDisabled();
      expect(saveMock).toHaveBeenCalledOnce();
    } finally {
      confirmMock.mockRestore();
    }
  });

  it('shows saved deduction details and distinguishes linked existing expenses', async () => {
    savedLookupMock.mockResolvedValue({
      id: 'settlement:sale:sale-1', saleId: 'sale-1', settlementNumber: '26025106',
      grossYen: 712800, expectedNetYen: 663597, adjustmentYen: 200,
      deductions: [
        { label: '注射代', amountYen: 3640, existingExpenseId: 'expense-vaccine' },
        { label: 'その他控除', amountYen: 45563 },
      ],
    });
    show();
    expect(await screen.findByText('登録済み精算の内容（閲覧のみ）')).toBeInTheDocument();
    expect(screen.getByText(/注射代：3,640円（登録済み経費を再利用）/)).toBeInTheDocument();
    expect(screen.getByText(/その他控除：45,563円/)).toBeInTheDocument();
    expect(screen.getByText(/調整額：200円/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認して新規経費を一括登録' })).not.toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('shows an already saved statement and prevents registration again', async () => {
    savedLookupMock.mockResolvedValue({
      id: 'settlement:sale:sale-1', saleId: 'sale-1', settlementNumber: '26025106',
      grossYen: 712800, expectedNetYen: 663597,
    });
    show();
    expect(await screen.findByText(/この販売は精算登録済みです/)).toHaveTextContent('663,597');
    expect(screen.getByText('登録済み精算の内容（閲覧のみ）')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '確認して新規経費を一括登録' })).not.toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('queries cloud settlement using the synchronized sale identifier on Standard', async () => {
    planMock.mockReturnValue('standard');
    saleMock.mockResolvedValue({ ...sale, syncRecordId: 'sale:cloud-record-42' });
    cloudStatusMock.mockResolvedValue({
      saleId: 'sale:cloud-record-42', registered: false, saleReady: true, settlementNumber: null,
    });
    show();
    await waitFor(() => expect(cloudStatusMock).toHaveBeenCalledWith('sale:cloud-record-42'));
    await waitFor(() => expect(cloudDetailsMock).toHaveBeenCalledWith('sale:cloud-record-42'));
    expect(cloudStatusMock).not.toHaveBeenCalledWith('sale-1');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('uses the existing sale sync ID fallback for legacy sales without a syncRecordId', async () => {
    planMock.mockReturnValue('standard');
    show();
    await waitFor(() => expect(cloudStatusMock).toHaveBeenCalledWith('sale:sale-1'));
    await waitFor(() => expect(cloudDetailsMock).toHaveBeenCalledWith('sale:sale-1'));
    expect(saveMock).not.toHaveBeenCalled();
  });


  it('keeps settlement registration blocked when the cloud sale is not ready', async () => {
    planMock.mockReturnValue('standard');
    cloudStatusMock.mockResolvedValue({
      saleId: 'sale:sale-1', registered: false, saleReady: false, settlementNumber: null,
    });
    show();
    expect(await screen.findByText(/クラウド側の販売記録が未登録・未販売または金額不正です/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });


  it('shows an existing cloud settlement without creating a second expense', async () => {
    planMock.mockReturnValue('standard');
    cloudStatusMock.mockResolvedValue({
      saleId: 'sale:sale-1', registered: true, saleReady: true, settlementNumber: 'settled-001',
    });
    show();
    expect(await screen.findByText(/クラウドで登録済みの精算です/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('does not save when cloud settlement status cannot be checked', async () => {
    planMock.mockReturnValue('standard');
    cloudStatusMock.mockRejectedValue(new Error('network unavailable'));
    show();
    expect(await screen.findByText(/クラウドの精算状況を確認できません/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認して新規経費を一括登録' })).toBeDisabled();
    expect(saveMock).not.toHaveBeenCalled();
  });

});
