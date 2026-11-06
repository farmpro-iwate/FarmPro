import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CalfCertificateImport } from './CalfCertificateImport';
import type { CalfInput } from '../types/calf';
import { emptyCalfCertificateCandidate, type CalfCertificateCandidate } from '../utils/calfCertificateImport';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  user: { farmId: 'fixture-farm', id: 'fixture-user' } as { farmId: string; id: string } | null,
}));
vi.mock('../services/calfCertificateReader', () => ({ readCalfCertificate: mocks.read }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => mocks.user }));

function input(overrides: Partial<CalfInput> = {}): CalfInput {
  return {
    calfNumber: '', identificationNumber: '', name: '', birthday: '', sex: '雌',
    motherName: '', motherCowId: '', motherCowName: '', breedingMethod: '', breedingId: '',
    recipientCowId: '', recipientCowName: '', geneticMotherCowId: '', geneticMotherCowName: '', sireName: '',
    startWeight: 0, currentWeight: 0, elapsedDays: 0, milkAmount: 0, starterAmount: 0,
    feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
    weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note: '',
    ...overrides,
  };
}
function candidate(overrides: Partial<CalfCertificateCandidate> = {}): CalfCertificateCandidate {
  return {
    ...emptyCalfCertificateCandidate, documentType: 'calf-registration-certificate',
    identificationNumber: '0012345678', earTag: '6789', registrationNumber: 'TEST-CERT-01',
    name: '確認用子牛A', birthday: '2026-01-17', sex: '雌', sire: '確認用父牛', dam: '確認用母牛',
    maternalSire: '確認用母の父', maternalGrandSire: '確認用祖母の父', notes: [], ...overrides,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const checkbox = () => screen.getByRole('checkbox', { name: 'この子牛の証明書であることと、読み取り内容を確認しました' });
const applyButton = () => screen.getByRole('button', { name: '入力欄に反映' });
const fileInput = () => screen.getByLabelText('登録証明書の画像・PDF');
const imageFile = (name = 'synthetic-calf-certificate.jpg') => new File(['synthetic fixture'], name, { type: 'image/jpeg' });
async function readFile(user: ReturnType<typeof userEvent.setup>, file = imageFile()) {
  await screen.findByRole('dialog');
  await user.upload(fileInput(), file);
  await user.click(screen.getByRole('button', { name: '読み取る' }));
  await screen.findByRole('heading', { name: '読み取り内容を確認' });
}
let createUrl: Mock<(obj: Blob | MediaSource) => string>;
let revokeUrl: Mock<(url: string) => void>;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.user = { farmId: 'fixture-farm', id: 'fixture-user' };
  mocks.read.mockReset().mockResolvedValue(candidate());
  let sequence = 0;
  createUrl = vi.fn((_obj: Blob | MediaSource) => 'blob:synthetic-calf-' + ++sequence);
  revokeUrl = vi.fn((_url: string) => {});
  const NativeURL = URL;
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No record API belongs to this component'));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('CalfCertificateImport', () => {
  it('読み取りや確認チェックだけでは保存せず、反映時だけ候補を親へ渡し、開き直して原本を確認できる', async () => {
    const user = userEvent.setup();
    const current = input();
    const before = structuredClone(current);
    const onApply = vi.fn();
    const { unmount } = render(<CalfCertificateImport onApply={onApply} currentInput={current} targetLabel="確認用子牛" />);
    await user.click(screen.getByRole('button', { name: '登録証明書から入力' }));
    await user.upload(fileInput(), imageFile());
    expect(mocks.read).not.toHaveBeenCalled();
    expect(screen.getByText('対象：確認用子牛')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    await screen.findByRole('heading', { name: '読み取り内容を確認' });
    expect(screen.getByLabelText('個体識別番号（10桁）')).toHaveValue('0012345678');
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    await user.click(checkbox());
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(candidate());
    expect(current).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '登録証明書から入力' }));
    expect(screen.getByRole('img', { name: '選択した登録証明書' })).toHaveAttribute('src', 'blob:synthetic-calf-1');
    expect(screen.getByLabelText('名号')).toHaveValue('確認用子牛A');
    expect(checkbox()).not.toBeChecked();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-calf-1');
  });

  it('性別不明はフォームの既定の雌に置き換えず、選択し直して確認した後に反映する', async () => {
    const user = userEvent.setup();
    mocks.read.mockResolvedValue(candidate({ sex: '' }));
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={input()} autoOpen />);
    await readFile(user);
    expect(screen.getByRole('combobox', { name: '性別' })).toHaveTextContent('確認してください');
    await user.click(checkbox());
    expect(applyButton()).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: '性別' }));
    await user.click(screen.getByRole('option', { name: '雄' }));
    expect(checkbox()).not.toBeChecked();
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(candidate({ sex: '雄' }));
  });

  it('空欄は既存入力を保持すると表示し、血統の補助情報は備考の追記として確認できる', async () => {
    const user = userEvent.setup();
    const current = input({ calfNumber: '6789', name: '入力済み名号', motherName: '入力済み母牛',
      motherCowId: 'fixture-mother', motherCowName: '入力済み母牛', sireName: '入力済み父牛',
      note: '入力済みの備考', currentWeight: 80, managementStatus: '販売予定' });
    const before = structuredClone(current);
    const value = candidate({ earTag: '', name: '', sire: '', dam: '' });
    mocks.read.mockResolvedValue(value);
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={current} autoOpen />);
    await readFile(user);
    expect(screen.getByText(/空欄の項目は入力済みの情報を残します/)).toBeInTheDocument();
    expect(screen.getByLabelText('名号')).toHaveValue('');
    const note = screen.getByLabelText('反映後の備考') as HTMLTextAreaElement;
    expect(note.value).toContain('入力済みの備考');
    expect(note.value).toContain('TEST-CERT-01');
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(value);
    expect(current).toEqual(before);
  });

  it('別の個体識別番号の証明書は確認しても反映できない', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={input({ identificationNumber: '0098765432' })} autoOpen />);
    await readFile(user);
    await user.click(checkbox());
    expect(applyButton()).toBeDisabled();
    expect(screen.getAllByText(/個体識別番号/).some(node => node.textContent?.includes('一致') || node.textContent?.includes('異な'))).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it.each(['other', 'unknown'] as const)('書類分類%sを画面上で登録証明書へ変更して通すことはできない', async documentType => {
    const user = userEvent.setup();
    mocks.read.mockResolvedValue(candidate({ documentType }));
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={input()} autoOpen />);
    await readFile(user);
    expect(screen.getByText(/子牛登録証明書として確認できませんでした/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /書類/ })).not.toBeInTheDocument();
    await user.click(checkbox());
    expect(applyButton()).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('候補の編集や親フォームの入力変更で確認を解除する', async () => {
    const user = userEvent.setup();
    const current = input();
    const onApply = vi.fn();
    const { rerender } = render(<CalfCertificateImport onApply={onApply} currentInput={current} autoOpen />);
    await readFile(user);
    await user.click(checkbox());
    rerender(<CalfCertificateImport onApply={onApply} currentInput={{ ...current, currentWeight: 85 }} autoOpen />);
    expect(checkbox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
    await user.click(checkbox());
    await user.type(screen.getByLabelText('名号'), '確認後');
    expect(checkbox()).not.toBeChecked();
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(candidate({ name: '確認用子牛A確認後' }));
  });

  it.each([
    { farmId: 'another-fixture-farm', id: 'fixture-user' },
    { farmId: 'fixture-farm', id: 'another-fixture-user' },
  ])('読み取り中の農場または利用者切替で候補を破棄する: %s', async nextUser => {
    const user = userEvent.setup();
    const result = deferred<CalfCertificateCandidate>();
    mocks.read.mockReturnValueOnce(result.promise);
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={input()} autoOpen />);
    await screen.findByRole('dialog');
    await user.upload(fileInput(), imageFile());
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    mocks.user = nextUser;
    await act(async () => { result.resolve(candidate()); await result.promise; });
    expect(screen.getByText(/ログイン中の農場または利用者が変わりました/)).toBeInTheDocument();
    expect(screen.queryByLabelText('名号')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:synthetic-calf-1');
  });

  it('閉じた後や別ファイル選択後の古い応答・進捗が新しい候補を上書きしない', async () => {
    const user = userEvent.setup();
    const oldRead = deferred<CalfCertificateCandidate>();
    mocks.read.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(candidate({ name: '新しい確認用子牛' }));
    const onApply = vi.fn();
    render(<CalfCertificateImport onApply={onApply} currentInput={input()} autoOpen />);
    await screen.findByRole('dialog');
    await user.upload(fileInput(), imageFile('old.jpg'));
    await user.click(screen.getByRole('button', { name: '読み取る' }));
    const oldProgress = mocks.read.mock.calls[0][1].onProgress;
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '登録証明書から入力' }));
    await readFile(user, imageFile('new.jpg'));
    await act(async () => {
      oldProgress({ status: '古い進捗は表示しない', progress: 80 });
      oldRead.resolve(candidate({ name: '古い確認用子牛' }));
      await oldRead.promise;
    });
    expect(screen.queryByText('古い進捗は表示しない')).not.toBeInTheDocument();
    expect(screen.getByLabelText('名号')).toHaveValue('新しい確認用子牛');
    expect(screen.getByRole('img', { name: '選択した登録証明書' })).toHaveAttribute('src', 'blob:synthetic-calf-2');
    await user.click(checkbox());
    await user.click(applyButton());
    expect(onApply).toHaveBeenCalledExactlyOnceWith(candidate({ name: '新しい確認用子牛' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('親フォームが反映を拒否したら候補と原本を残し、再確認を必要にする', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn(() => { throw new Error('対象の子牛を確認してください。'); });
    render(<CalfCertificateImport onApply={onApply} currentInput={input()} autoOpen />);
    await readFile(user);
    await user.click(checkbox());
    await user.click(applyButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('対象の子牛を確認してください。')).toBeInTheDocument();
    expect(screen.getByLabelText('名号')).toHaveValue('確認用子牛A');
    expect(screen.getByRole('img', { name: '選択した登録証明書' })).toBeInTheDocument();
    expect(checkbox()).not.toBeChecked();
    expect(applyButton()).toBeDisabled();
  });

  it('保存中は反映せず、自動表示は一度だけで、PDFは原本リンクで確認できる', async () => {
    const user = userEvent.setup();
    const current = input();
    const onApply = vi.fn();
    const { rerender } = render(<StrictMode><CalfCertificateImport onApply={onApply} currentInput={current} autoOpen disabled /></StrictMode>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<StrictMode><CalfCertificateImport onApply={onApply} currentInput={current} autoOpen /></StrictMode>);
    await readFile(user, new File(['synthetic PDF'], 'anonymous-calf.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('link', { name: 'PDFを開いて確認' })).toHaveAttribute('href', 'blob:synthetic-calf-1');
    expect(screen.queryByRole('img', { name: '選択した登録証明書' })).not.toBeInTheDocument();
    await user.click(checkbox());
    rerender(<StrictMode><CalfCertificateImport onApply={onApply} currentInput={current} autoOpen disabled /></StrictMode>);
    expect(applyButton()).toBeDisabled();
    expect(checkbox()).not.toBeChecked();
    expect(screen.getByLabelText('名号')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<StrictMode><CalfCertificateImport onApply={onApply} currentInput={current} autoOpen /></StrictMode>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
