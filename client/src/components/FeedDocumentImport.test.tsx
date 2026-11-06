import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FeedDocumentImport } from './FeedDocumentImport';
import {
  emptyFeedDocumentCandidate, emptyFeedDocumentLine,
  type FeedDocumentCandidate, type FeedDocumentLine, type FeedDocumentSelection,
} from '../utils/feedDocumentImport';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  user: { farmId: 'fixture-farm', id: 'fixture-user' } as { farmId: string; id: string } | null,
}));
vi.mock('../services/feedDocumentReader', () => ({ readFeedDocument: mocks.read }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => mocks.user }));

function line(overrides: Partial<FeedDocumentLine> = {}): FeedDocumentLine {
  return { ...emptyFeedDocumentLine, kind: 'feed', feedName: '確認用配合飼料', quantity: '10',
    unit: '袋', originalUnit: '袋', bagWeightKg: '20', unitPriceYen: '1100',
    unitPriceBasis: 'tax-included', priceUnit: '袋', grossYen: '11000', netYen: '10000',
    taxYen: '1000', taxRate: '10', notes: [], ...overrides };
}
function candidate(overrides: Partial<FeedDocumentCandidate> = {}): FeedDocumentCandidate {
  return { ...emptyFeedDocumentCandidate, documentType: 'invoice', documentNumber: 'QA-DOCUMENT-1',
    issueDate: '2026-10-31', deliveryDate: '2026-10-20', supplier: '確認用仕入先',
    lines: [line()], notes: [], ...overrides };
}
function selection(value = candidate(), lineIndex = 0): FeedDocumentSelection {
  return { sessionId: 'fixture-document-session', candidate: value, lineIndex };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const checkbox = () => screen.getByRole('checkbox', { name: '品目・数量・金額と、未登録の入庫であることを確認しました' });
const applyButton = () => screen.getByRole('button', { name: '入庫の入力欄に反映' });
const fileInput = () => screen.getByLabelText('納品書・請求書の画像・PDF');
const imageFile = (name = 'synthetic-feed-document.jpg') => new File(['synthetic fixture'], name, { type: 'image/jpeg' });
const chooseLine = async (user: ReturnType<typeof userEvent.setup>, index: number) => {
  await user.click(screen.getByRole('combobox', { name: '取り込む品目' }));
  await user.click(screen.getByRole('option', { name: new RegExp(`^${index + 1}\\.`) }));
};
let createUrl: Mock<(obj: Blob | MediaSource) => string>;
let revokeUrl: Mock<(url: string) => void>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.user = { farmId: 'fixture-farm', id: 'fixture-user' };
  mocks.read.mockReset().mockResolvedValue(candidate());
  let sequence = 0;
  createUrl = vi.fn((_obj: Blob | MediaSource) => 'blob:synthetic-feed-' + ++sequence);
  revokeUrl = vi.fn((_url: string) => {});
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No record API belongs to this component'));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('FeedDocumentImport', () => {
  it('複数明細の読み取りだけでは品目を選ばず、確認して反映した1品目だけを親へ渡す', async () => {
    const user = userEvent.setup();
    const value = candidate({ lines: [line(), line({ feedName: '確認用別飼料' })] });
    mocks.read.mockResolvedValue(value);
    const onApply = vi.fn();
    const { unmount } = render(<FeedDocumentImport onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: '納品書・請求書から入力' }));
    await user.upload(fileInput(), imageFile());
    expect(mocks.read).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await screen.findByRole('combobox', { name: '取り込む品目' });
    expect(screen.queryByLabelText('飼料名')).not.toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
    await chooseLine(user, 1);
    expect(screen.getByLabelText('飼料名')).toHaveValue('確認用別飼料');
    expect(applyButton()).toBeDisabled();
    await user.click(checkbox());
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ candidate: value, lineIndex: 1 });
    expect(onApply.mock.calls[0][0].sessionId).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeUrl).not.toHaveBeenCalled();
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-feed-1');
  });

  it('同じ書類の次の品目を開くと原本を保持し、登録済み品目を除いて確認できる', async () => {
    const user = userEvent.setup();
    mocks.read.mockResolvedValue(candidate({ lines: [line(), line({ feedName: '確認用別飼料' })] }));
    const onApply = vi.fn();
    const { rerender, unmount } = render(<FeedDocumentImport onApply={onApply} autoOpen />);
    await screen.findByRole('dialog');
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await screen.findByRole('combobox', { name: '取り込む品目' });
    await chooseLine(user, 0);
    await user.click(checkbox());
    await user.click(applyButton());
    const applied = onApply.mock.calls[0][0] as FeedDocumentSelection;
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<FeedDocumentImport onApply={onApply} initialSelection={applied} completedLineIndexes={[0]} />);
    await user.click(screen.getByRole('button', { name: '納品書・請求書から入力' }));
    expect(screen.getByRole('img', { name: '選択した納品書・請求書' })).toHaveAttribute('src', 'blob:synthetic-feed-1');
    expect(screen.getByText('synthetic-feed-document.jpg')).toBeInTheDocument();
    expect(screen.queryByLabelText('飼料名')).not.toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: '取り込む品目' }));
    expect(screen.getByRole('option', { name: /^1\./ })).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('option', { name: /^2\./ }));
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply.mock.calls[1][0]).toMatchObject({ sessionId: applied.sessionId, lineIndex: 1 });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-feed-1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('品目を切り替えても編集を保持し、編集と選択変更のたびに確認をやり直す', async () => {
    const user = userEvent.setup();
    const initial = selection(candidate({ lines: [line(), line({ feedName: '確認用別飼料' })] }));
    const onApply = vi.fn();
    render(<FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen />);
    await screen.findByRole('dialog');
    await user.click(checkbox());
    await user.type(screen.getByLabelText('飼料名'), 'を確認');
    expect(checkbox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
    await user.click(checkbox());
    await chooseLine(user, 1);
    expect(checkbox()).not.toBeChecked();
    await chooseLine(user, 0);
    expect(screen.getByLabelText('飼料名')).toHaveValue('確認用配合飼料を確認');
    await user.click(checkbox());
    await user.type(screen.getByLabelText('仕入先'), 'を確認');
    expect(checkbox()).not.toBeChecked();
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply.mock.calls[0][0]).toMatchObject({ sessionId: initial.sessionId, lineIndex: 0,
      candidate: { supplier: '確認用仕入先を確認', lines: [expect.objectContaining({ feedName: '確認用配合飼料を確認' }), initial.candidate.lines[1]] } });
    expect(initial.candidate.lines[0].feedName).toBe('確認用配合飼料');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('確認済みでも完了した品目には再反映せず、新しい書類には完了状態を引き継がない', async () => {
    const user = userEvent.setup();
    const initial = selection();
    const onApply = vi.fn();
    const { rerender } = render(<FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen />);
    await screen.findByRole('dialog');
    await user.click(checkbox());
    rerender(<FeedDocumentImport onApply={onApply} initialSelection={initial} completedLineIndexes={[0]} autoOpen />);
    expect(applyButton()).toBeDisabled();
    expect(checkbox()).not.toBeChecked();
    expect(screen.getByText(/この品目は登録済みです/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '納品書・請求書から入力' }));
    expect(screen.getByText(/この書類の品目はすべて登録済みです/)).toBeInTheDocument();
    expect(screen.queryByLabelText('飼料名')).not.toBeInTheDocument();
    await user.upload(fileInput(), imageFile('new-document.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await screen.findByLabelText('飼料名');
    await user.click(checkbox());
    expect(applyButton()).toBeEnabled();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].sessionId).not.toBe(initial.sessionId);
    expect(onApply.mock.calls[0][0].lineIndex).toBe(0);
  });

  it.each([
    ['数量', line({ quantity: '0' })],
    ['金額', line({ grossYen: '12000' })],
    ['飼料以外', line({ feedName: '送料', kind: 'other' })],
  ])('%sが未確認・不一致の候補はチェックを入れても反映できない', async (_kind, invalidLine) => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FeedDocumentImport onApply={onApply} initialSelection={selection(candidate({ lines: [invalidLine] }))} autoOpen />);
    await screen.findByRole('dialog');
    await user.click(checkbox());
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('金額のない納品書は数量だけと明示し、0円の金額を作らず確認して渡す', async () => {
    const user = userEvent.setup();
    const value = candidate({ documentType: 'delivery-note', lines: [line({ unitPriceYen: '', grossYen: '', netYen: '', taxYen: '', taxRate: '' })] });
    const onApply = vi.fn();
    render(<FeedDocumentImport onApply={onApply} initialSelection={selection(value)} autoOpen />);
    await screen.findByRole('dialog');
    expect(screen.getByText(/金額の記載がない場合は、数量だけを反映できます/)).toBeInTheDocument();
    expect(screen.getByText('反映する税込金額：未入力')).toBeInTheDocument();
    expect(screen.getByText('反映する消費税額：未入力')).toBeInTheDocument();
    expect(screen.getByText('反映する入庫日：2026-10-20')).toBeInTheDocument();
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply.mock.calls[0][0].candidate.lines[0]).toMatchObject({ grossYen: '', netYen: '', taxYen: '' });
  });

  it('税率から補った金額を確認用に表示し、元の書類の空欄と区別する', async () => {
    const user = userEvent.setup();
    const value = candidate({ lines: [line({ unitPriceYen: '', grossYen: '', taxYen: '' })] });
    const onApply = vi.fn();
    render(<FeedDocumentImport onApply={onApply} initialSelection={selection(value)} autoOpen />);
    await screen.findByRole('dialog');
    expect(screen.getByText(/税率から換算した金額を含みます/)).toBeInTheDocument();
    expect(screen.getByLabelText('書類の税込金額（円）')).toHaveValue('');
    expect(screen.getByText('反映する税込金額：11,000円')).toBeInTheDocument();
    expect(screen.getByText('反映する消費税額：1,000円')).toBeInTheDocument();
    expect(applyButton()).toBeDisabled();
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].candidate.lines[0].grossYen).toBe('');
  });

  it.each([
    { farmId: 'another-fixture-farm', id: 'fixture-user' },
    { farmId: 'fixture-farm', id: 'another-fixture-user' },
  ])('読み取り中に農場または利用者が変われば候補を採用しない: %s', async (nextUser) => {
    const user = userEvent.setup();
    const result = deferred<FeedDocumentCandidate>();
    mocks.read.mockReturnValueOnce(result.promise);
    const onApply = vi.fn();
    render(<FeedDocumentImport onApply={onApply} autoOpen />);
    await screen.findByRole('dialog');
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    mocks.user = nextUser;
    await act(async () => { result.resolve(candidate()); await result.promise; });
    expect(screen.getByText(/ログイン中の農場または利用者が変わりました/)).toBeInTheDocument();
    expect(screen.queryByLabelText('飼料名')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-feed-1');
  });

  it('確認後のログアウトでも反映を止め、親が反映不可にした場合も確認を解除する', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const initial = selection();
    const { rerender } = render(<FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen />);
    await screen.findByRole('dialog');
    await user.click(checkbox());
    mocks.user = null;
    await user.click(applyButton());
    expect(onApply).not.toHaveBeenCalled();
    expect(checkbox()).not.toBeChecked();
    expect(screen.getByText(/ログイン中の農場または利用者が変わりました/)).toBeInTheDocument();
    mocks.user = { farmId: 'fixture-farm', id: 'fixture-user' };
    rerender(<FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen />);
    await user.click(checkbox());
    rerender(<FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen disabled />);
    expect(checkbox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
  });

  it('新しい書類を選んだ後の古い応答や、閉じた後の応答を採用しない', async () => {
    const user = userEvent.setup();
    const old = deferred<FeedDocumentCandidate>();
    const closed = deferred<FeedDocumentCandidate>();
    mocks.read.mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(candidate({ supplier: '新しい確認用仕入先' }))
      .mockReturnValueOnce(closed.promise);
    const onApply = vi.fn();
    const { unmount } = render(<FeedDocumentImport onApply={onApply} autoOpen />);
    await screen.findByRole('dialog');
    await user.upload(fileInput(), imageFile('old.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await user.upload(fileInput(), imageFile('new.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    expect(await screen.findByLabelText('仕入先')).toHaveValue('新しい確認用仕入先');
    await act(async () => { old.resolve(candidate({ supplier: '古い確認用仕入先' })); await old.promise; });
    expect(screen.getByLabelText('仕入先')).toHaveValue('新しい確認用仕入先');
    await user.upload(fileInput(), imageFile('closed.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await act(async () => { closed.resolve(candidate()); await closed.promise; });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '納品書・請求書から入力' }));
    expect(screen.queryByLabelText('飼料名')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledTimes(2);
    unmount();
    expect(revokeUrl).toHaveBeenCalledTimes(3);
  });

  it('反映を親が拒否した時は候補を保持し、自動表示を閉じた後に繰り返さない', async () => {
    const user = userEvent.setup();
    const initial = selection();
    const onApply = vi.fn(() => { throw new Error('既存の入庫を確認してください。'); });
    const { rerender } = render(<StrictMode><FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen /></StrictMode>);
    await screen.findByRole('dialog');
    await user.click(checkbox());
    await user.click(applyButton());
    expect(screen.getByText('既存の入庫を確認してください。')).toBeInTheDocument();
    expect(screen.getByLabelText('飼料名')).toHaveValue('確認用配合飼料');
    expect(checkbox()).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<StrictMode><FeedDocumentImport onApply={onApply} initialSelection={initial} autoOpen completedLineIndexes={[0]} /></StrictMode>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
