import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SaleStatementImport } from './SaleStatementImport';
import { emptySaleStatementCandidate, type SaleStatementCandidate } from '../utils/saleStatementImport';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  user: { farmId: 'fixture-farm' } as { farmId: string } | null,
}));
vi.mock('../services/saleStatementDocumentReader', () => ({ readSaleStatementDocument: mocks.read }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => mocks.user }));

const target = { targetNumber: 'QA-01', targetName: '見本牛', identificationNumber: '0000000001' };
function candidate(overrides: Partial<SaleStatementCandidate> = {}): SaleStatementCandidate {
  return {
    ...emptySaleStatementCandidate, documentType: 'sale-settlement', animalCount: '1',
    statementNumber: 'EXAMPLE-001', saleDate: '2026-01-10', paymentDate: '2026-01-15',
    marketName: '検証市場', issuerName: '検証組合', identificationNumber: '0000000001',
    earTag: 'QA-01', animalName: '見本牛', birthday: '2025-01-01', sex: '雌',
    saleWeightKg: '300', grossYen: '100000', deductionTotalYen: '4800', netYen: '95200',
    deductions: [{ label: '手数料', amountYen: '5000' }],
    adjustments: [{ label: '返金', amountYen: '200' }], notes: [],
    ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const confirmBox = () => screen.getByRole('checkbox', { name: '対象の牛と読み取り内容を確認しました' });
const applyButton = () => screen.getByRole('button', { name: '入力欄に反映' });
const fileInput = () => screen.getByLabelText('精算書の画像・PDF');
const imageFile = (name = 'synthetic-statement.jpg') => new File(['synthetic fixture'], name, { type: 'image/jpeg' });
let createUrl: Mock<(obj: Blob | MediaSource) => string>;
let revokeUrl: Mock<(url: string) => void>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.user = { farmId: 'fixture-farm' };
  mocks.read.mockReset().mockResolvedValue(candidate());
  let sequence = 0;
  createUrl = vi.fn((_obj: Blob | MediaSource) => 'blob:synthetic-' + ++sequence);
  revokeUrl = vi.fn((_url: string) => {});
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No record API is expected from this component'));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SaleStatementImport', () => {
  it('読み取り・編集・確認チェックでは保存せず、明示した反映ボタンだけで候補を渡す', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<SaleStatementImport target={target} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    expect(await screen.findByLabelText('書類の名号')).toHaveValue('見本牛');
    expect(onApply).not.toHaveBeenCalled();
    expect(applyButton()).toBeDisabled();
    await user.clear(screen.getByLabelText('市場名'));
    await user.type(screen.getByLabelText('市場名'), '確認した市場');
    await user.click(confirmBox());
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ marketName: '確認した市場', grossYen: '100000' });
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-1');
  });

  it('金額が不一致の候補は、確認チェックを入れても反映できない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={candidate({ netYen: '95000' })} />);
    await screen.findByRole('dialog');
    expect(screen.getByText(/計算した差引が、精算書の金額と一致しません/)).toBeInTheDocument();
    await user.click(confirmBox());
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('選択牛と書類の番号が違う場合は反映できない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<SaleStatementImport target={{ ...target, identificationNumber: '0000000002' }}
      onApply={onApply} autoOpen initialCandidate={candidate()} />);
    await screen.findByRole('dialog');
    expect(screen.getByText(/個体識別番号と、選択した牛の番号が一致しません/)).toBeInTheDocument();
    await user.click(confirmBox());
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('対象牛が未選択の場合は反映できない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<SaleStatementImport target={{ targetNumber: '' }} onApply={onApply} autoOpen initialCandidate={candidate()} />);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('候補を編集した場合と対象牛を変更した場合は確認チェックを解除する', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const initial = candidate();
    const { rerender } = render(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={initial} />);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    expect(applyButton()).toBeEnabled();
    await user.type(screen.getByLabelText('精算元・発行元'), '確認');
    expect(confirmBox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
    await user.click(confirmBox());
    rerender(<SaleStatementImport target={{ ...target, targetName: '選択を確認した牛' }} onApply={onApply} autoOpen initialCandidate={initial} />);
    expect(confirmBox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('親が反映不可にした時は、開いている候補を反映できない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const initial = candidate();
    const { rerender } = render(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={initial} />);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    rerender(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={initial} disabled />);
    expect(confirmBox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('別ファイルを選んだ後に前の読み取りが完了しても、新しい候補を上書きしない', async () => {
    const user = userEvent.setup();
    const first = deferred<SaleStatementCandidate>();
    mocks.read.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(candidate({ statementNumber: 'EXAMPLE-002' }));
    const onApply = vi.fn();
    render(<SaleStatementImport target={target} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.upload(fileInput(), imageFile('first.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await user.upload(fileInput(), imageFile('second.jpg'));
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-1');
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    expect(await screen.findByLabelText('精算番号')).toHaveValue('EXAMPLE-002');
    await act(async () => { first.resolve(candidate({ statementNumber: 'EXAMPLE-OLD' })); await first.promise; });
    expect(screen.getByLabelText('精算番号')).toHaveValue('EXAMPLE-002');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('閉じた後の読み取り結果を採用せず、写真の一時URLを解放する', async () => {
    const user = userEvent.setup();
    const result = deferred<SaleStatementCandidate>();
    mocks.read.mockImplementationOnce(() => result.promise);
    render(<SaleStatementImport target={target} onApply={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-1');
    await act(async () => { result.resolve(candidate()); await result.promise; });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    expect(screen.queryByLabelText('精算番号')).not.toBeInTheDocument();
  });

  it('読み取り中に農場が変わった場合は結果を採用しない', async () => {
    const user = userEvent.setup();
    const result = deferred<SaleStatementCandidate>();
    mocks.read.mockImplementationOnce(() => result.promise);
    const onApply = vi.fn();
    render(<SaleStatementImport target={target} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    mocks.user = { farmId: 'another-fixture-farm' };
    await act(async () => { result.resolve(candidate()); await result.promise; });
    expect(screen.getByText(/ログイン中の農場が変わりました/)).toBeInTheDocument();
    expect(screen.queryByLabelText('精算番号')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('確認した後でもログアウトしていたら反映しない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={candidate()} />);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    mocks.user = null;
    await user.click(applyButton());
    expect(screen.getByText(/ログイン中の農場が変わりました/)).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(confirmBox()).not.toBeChecked();
  });

  it('反映先が例外を返しても候補は保持し、確認をやり直せる', async () => {
    const user = userEvent.setup();
    const initial = candidate();
    const onApply = vi.fn(() => { throw new Error('対象の販売記録を再確認してください。'); });
    render(<SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={initial} />);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    await user.click(applyButton());
    expect(screen.getByText('対象の販売記録を再確認してください。')).toBeInTheDocument();
    expect(screen.getByLabelText('精算番号')).toHaveValue('EXAMPLE-001');
    expect(initial.statementNumber).toBe('EXAMPLE-001');
    expect(confirmBox()).not.toBeChecked();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('StrictModeでも初回の候補を確認でき、自動表示は閉じた後に繰り返さない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { rerender } = render(<StrictMode><SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={candidate()} /></StrictMode>);
    await screen.findByRole('dialog');
    await user.click(confirmBox());
    expect(applyButton()).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<StrictMode><SaleStatementImport target={target} onApply={onApply} autoOpen initialCandidate={candidate({ statementNumber: 'EXAMPLE-002' })} /></StrictMode>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '精算書から入力' }));
    expect(screen.getByLabelText('精算番号')).toHaveValue('EXAMPLE-002');
  });
});
