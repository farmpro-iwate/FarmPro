import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfForm } from './CalfForm';
import type { CalfInput } from '../types/calf';
import * as calfApi from '../services/calfApi';
import * as cattleApi from '../services/api';
import * as breedingApi from '../services/breedingApi';
import * as repository from '../storage/repository';
import {
  emptyCalfCertificateCandidate, type CalfCertificateCandidate,
} from '../utils/calfCertificateImport';

type ImporterProps = {
  onApply: (candidate: CalfCertificateCandidate) => void;
  currentInput: CalfInput;
  autoOpen?: boolean;
  disabled?: boolean;
  targetLabel?: string;
};
const importer = vi.hoisted(() => ({ latest: null as ImporterProps | null }));
vi.mock('../components/CalfCertificateImport', () => ({
  CalfCertificateImport: (props: ImporterProps) => {
    importer.latest = props;
    return <button type="button" disabled={props.disabled} onClick={() => props.onApply(nextCandidate)}>
      証明書の候補を反映
    </button>;
  },
}));
vi.mock('../components/BirthdayField', () => ({
  BirthdayField: ({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) =>
    <input aria-label="生年月日" type="date" value={value} onChange={event => onChange(event.target.value)} required={required} />,
}));

const owner = {
  id: 'qa-user', farmId: 'qa-farm', plan: 'free', active: true, role: 'owner',
  name: '証明書確認用利用者', farmName: '証明書確認用農場', email: 'certificate-qa@example.invalid',
};
let nextCandidate: CalfCertificateCandidate;

function storedCalf(overrides: Partial<calfApi.StoredCalf> = {}): calfApi.StoredCalf {
  return {
    id: 11, calfNumber: '0456', identificationNumber: '0123456789', name: '既存の確認用子牛',
    birthday: '2026-04-15', sex: '雄', motherName: '確認用血統母', motherCowName: '確認用血統母',
    motherCowId: '1111', breedingMethod: '受精卵移植', breedingId: 'fixture-et-1',
    recipientCowId: '2222', recipientCowName: '確認用代理母',
    geneticMotherCowId: '1111', geneticMotherCowName: '確認用血統母', sireName: '登録済み父牛',
    calvingId: 'fixture-calving-1', startWeight: 38, currentWeight: 147, elapsedDays: 120,
    milkAmount: 3.5, starterAmount: 2.2, feedingMethod: '混合哺育',
    weaningPlannedDate: '2026-07-01', weaningDate: '2026-07-03', weaningStatus: '離乳済み',
    weaningWeight: 130, weaningStarterAmount: 3.4, milkEndDate: '2026-07-04',
    managementStatus: '販売予定', note: '既存の成長メモ\n経過観察の記録',
    createdAt: '2026-04-15T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function mount(entry = '/calves/new?source=calf-certificate') {
  render(<MemoryRouter initialEntries={[entry]}>
    <LocationProbe />
    <Link to="/calves/22/edit?source=calf-certificate">別の子牛へ移動</Link>
    <Link to="/calves/new?source=calf-certificate">新規子牛へ移動</Link>
    <Routes>
      <Route path="/calves/new" element={<CalfForm mode="create" />} />
      <Route path="/calves/:id/edit" element={<CalfForm mode="edit" />} />
      <Route path="/calves" element={<div>子牛台帳に移動</div>} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear(); sessionStorage.clear(); importer.latest = null;
  localStorage.setItem('farmpro.authUser', JSON.stringify(owner));
  nextCandidate = {
    ...emptyCalfCertificateCandidate, documentType: 'calf-registration-certificate',
    identificationNumber: '0123456789', earTag: '0456', registrationNumber: 'FIXTURE-001',
    name: '証明書の確認用子牛', birthday: '2026-04-15', sex: '雄',
    sire: '証明書の父牛', dam: '確認用血統母', maternalSire: '確認用母父', maternalGrandSire: '確認用祖母父',
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([]);
  vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
  vi.spyOn(calfApi, 'getCalf').mockResolvedValue(storedCalf());
  vi.spyOn(repository, 'getAllRecords').mockResolvedValue([]);
  vi.spyOn(calfApi, 'createCalf').mockImplementation(async input => ({ ...storedCalf({ ...input, id: 31 }), syncWarning: null }));
  vi.spyOn(calfApi, 'updateCalf').mockImplementation(async (id, input) => storedCalf({ ...input, id: Number(id) }));
  vi.spyOn(cattleApi, 'createCattle').mockRejectedValue(new Error('子牛証明書から牛台帳を作成してはいけません。'));
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear();
});

describe('子牛登録証明書から子牛フォームへ反映して保存する', () => {
  it('新規候補の反映では保存せず、利用者が保存を押したときだけ子牛1頭を作る', async () => {
    const user = userEvent.setup(); mount();
    expect(importer.latest?.autoOpen).toBe(true);
    expect(importer.latest?.targetLabel).toBe('新しく登録する子牛');
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    expect(screen.getByLabelText('個体識別番号')).toHaveValue('0123456789');
    expect(screen.getByLabelText('名号')).toHaveValue('証明書の確認用子牛');
    expect(importer.latest?.currentInput).toMatchObject({
      calfNumber: '0456', birthday: '2026-04-15', sex: '雄', sireName: '証明書の父牛',
    });
    expect(repository.getAllRecords).not.toHaveBeenCalled();
    expect(calfApi.createCalf).not.toHaveBeenCalled();
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findAllByText('登録しました。');
    expect(calfApi.createCalf).toHaveBeenCalledTimes(1);
    expect(calfApi.createCalf).toHaveBeenCalledWith(expect.objectContaining({
      identificationNumber: '0123456789', calfNumber: '0456', name: '証明書の確認用子牛',
      birthday: '2026-04-15', sex: '雄', motherName: '確認用血統母', sireName: '証明書の父牛',
    }));
    expect(repository.getAllRecords).toHaveBeenCalledWith('calves');
    expect(repository.getAllRecords).toHaveBeenCalledWith('cattle');
    expect(calfApi.getCalfList).not.toHaveBeenCalled();
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
    expect(importer.latest?.disabled).toBe(true);
  });

  it('既存子牛への反映は体重・哺育・離乳・飼養区分・備考・ET代理母と関連IDを保持して更新する', async () => {
    const existing = storedCalf();
    const before = structuredClone(existing);
    vi.mocked(calfApi.getCalf).mockResolvedValue(existing);
    vi.mocked(repository.getAllRecords).mockImplementation(async store => store === 'calves' ? [existing] : []);
    const user = userEvent.setup(); mount('/calves/11/edit?source=calf-certificate');
    await screen.findByDisplayValue('既存の確認用子牛');
    expect(importer.latest?.autoOpen).toBe(true);
    expect(importer.latest?.targetLabel).toContain('耳標 0456');
    expect(importer.latest?.targetLabel).toContain('既存の確認用子牛');
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    const preserved = {
      startWeight: 38, currentWeight: 147, elapsedDays: 120, milkAmount: 3.5, starterAmount: 2.2,
      feedingMethod: '混合哺育', weaningPlannedDate: '2026-07-01', weaningDate: '2026-07-03',
      weaningStatus: '離乳済み', weaningWeight: 130, weaningStarterAmount: 3.4, milkEndDate: '2026-07-04',
      managementStatus: '販売予定', breedingMethod: '受精卵移植', breedingId: 'fixture-et-1',
      recipientCowId: '2222', recipientCowName: '確認用代理母', motherCowId: '1111',
      geneticMotherCowId: '1111', geneticMotherCowName: '確認用血統母',
      motherName: '確認用血統母', motherCowName: '確認用血統母',
    };
    expect(importer.latest?.currentInput).toMatchObject(preserved);
    expect(importer.latest?.currentInput.note).toBe(existing.note + '\n登録証明書の登録番号：FIXTURE-001\n登録証明書の母の父：確認用母父\n登録証明書の祖母の父：確認用祖母父');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findAllByText('端末内のデータを更新しました。');
    expect(calfApi.updateCalf).toHaveBeenCalledTimes(1);
    expect(calfApi.updateCalf).toHaveBeenCalledWith('11', expect.objectContaining({
      ...preserved, identificationNumber: '0123456789', calfNumber: '0456',
      name: '証明書の確認用子牛', sireName: '証明書の父牛',
      note: existing.note + '\n登録証明書の登録番号：FIXTURE-001\n登録証明書の母の父：確認用母父\n登録証明書の祖母の父：確認用祖母父',
    }));
    expect(calfApi.createCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
    expect(existing).toEqual(before);
  });

  it.each([
    { label: '通常表記', identificationNumber: '0123456789', calfNumber: '0456' },
    { label: '全角・区切り付き', identificationNumber: '０１２３４－５６７８９', calfNumber: '０４－５６' },
  ])('既存番号が$labelでも本人だけ反映し、反映後の別ID手入力は保存前に止める', async original => {
    vi.mocked(calfApi.getCalf).mockResolvedValue(storedCalf(original));
    const user = userEvent.setup(); mount('/calves/11/edit?source=calf-certificate');
    await screen.findByDisplayValue('既存の確認用子牛');
    expect(() => importer.latest!.onApply({ ...nextCandidate, identificationNumber: '0987654321' }))
      .toThrow(/個体識別番号.*一致しません/);
    expect(importer.latest?.currentInput.identificationNumber).toBe(original.identificationNumber);
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    expect(importer.latest?.currentInput).toMatchObject({ identificationNumber: '0123456789', calfNumber: '0456' });
    fireEvent.change(screen.getByLabelText('個体識別番号'), { target: { value: '0987654321' } });
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findAllByText(/登録済みの子牛と個体識別番号が異なります/);
    expect(repository.getAllRecords).not.toHaveBeenCalled();
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(calfApi.createCalf).not.toHaveBeenCalled();
  });

  it.each(['calves', 'cattle'] as const)('新規の同じ個体識別番号が%sにあると読み取り専用照合で止め、既存リンクを表示する', async storeName => {
    const existing = { id: 44, identificationNumber: nextCandidate.identificationNumber, calfNumber: '0999',
      earTag: '0999', name: '登録済みの確認用個体', birthday: nextCandidate.birthday };
    const before = structuredClone(existing);
    vi.mocked(repository.getAllRecords).mockImplementation(async store => store === storeName ? [existing] : []);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    const cattleReadsBeforeSave = vi.mocked(cattleApi.getCattleList).mock.calls.length;
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findAllByText(/この個体は登録済みです/);
    expect(repository.getAllRecords).toHaveBeenCalledTimes(2);
    expect(cattleApi.getCattleList).toHaveBeenCalledTimes(cattleReadsBeforeSave);
    expect(calfApi.getCalfList).not.toHaveBeenCalled();
    expect(calfApi.createCalf).not.toHaveBeenCalled();
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /登録済みの確認用個体.*を確認/ })).toHaveAttribute('href',
      storeName === 'calves' ? '/calves/44/edit?source=calf-certificate' : '/cattle/44');
    expect(existing).toEqual(before);
  });

  it.each(['farmId', 'id'] as const)('照会中に%sが変わった場合は保存しない', async key => {
    const pending = deferred<calfApi.StoredCalf[]>();
    vi.mocked(repository.getAllRecords).mockImplementation(store => store === 'calves' ? pending.promise : Promise.resolve([]));
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(repository.getAllRecords).toHaveBeenCalledTimes(2);
    localStorage.setItem('farmpro.authUser', JSON.stringify({ ...owner, [key]: 'changed-owner' }));
    await act(async () => { pending.resolve([]); });
    await screen.findAllByText(/ログイン中の農場または利用者が変わりました/);
    expect(calfApi.createCalf).not.toHaveBeenCalled();
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
  });

  it('保存中の連打と保存成功直後の再保存を1回に抑える', async () => {
    const pending = deferred<Awaited<ReturnType<typeof calfApi.createCalf>>>();
    vi.mocked(calfApi.createCalf).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    const save = screen.getByRole('button', { name: '保存' });
    act(() => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(calfApi.createCalf).toHaveBeenCalledTimes(1));
    expect(save).toBeDisabled();
    expect(importer.latest?.disabled).toBe(true);
    expect(repository.getAllRecords).toHaveBeenCalledTimes(2);
    fireEvent.click(save);
    expect(calfApi.createCalf).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve({ ...storedCalf({ ...vi.mocked(calfApi.createCalf).mock.calls[0][0], id: 31 }), syncWarning: null }); });
    await screen.findAllByText('登録しました。');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(calfApi.createCalf).toHaveBeenCalledTimes(1);
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
  });

  it('照会中に別の子牛へ移動した場合、旧候補の保存や完了後の画面遷移を行わない', async () => {
    const pending = deferred<calfApi.StoredCalf[]>();
    const nextCalf = storedCalf({ id: 22, identificationNumber: '0987654321', calfNumber: '0999', name: '次の確認用子牛' });
    vi.mocked(calfApi.getCalf).mockImplementation(async id => id === '22' ? nextCalf : storedCalf());
    vi.mocked(repository.getAllRecords).mockImplementation(store => store === 'calves' ? pending.promise : Promise.resolve([]));
    const user = userEvent.setup(); mount('/calves/11/edit?source=calf-certificate');
    await screen.findByDisplayValue('既存の確認用子牛');
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(repository.getAllRecords).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('link', { name: '別の子牛へ移動' }));
    await screen.findByDisplayValue('次の確認用子牛');
    expect(importer.latest?.targetLabel).toContain('耳標 0999');
    expect(importer.latest?.currentInput.identificationNumber).toBe('0987654321');
    vi.useFakeTimers();
    await act(async () => { pending.resolve([]); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByTestId('location')).toHaveTextContent('/calves/22/edit?source=calf-certificate');
    expect(screen.getByLabelText('名号')).toHaveValue('次の確認用子牛');
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(calfApi.createCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
    expect(importer.latest?.disabled).toBe(false);
  });

  it('既存編集から新規へ直接移動すると空のフォームへ戻り、次の保存では新しい子牛だけを作る', async () => {
    const existing = storedCalf();
    vi.mocked(repository.getAllRecords).mockImplementation(async store => store === 'calves' ? [existing] : []);
    const user = userEvent.setup(); mount('/calves/11/edit?source=calf-certificate');
    await screen.findByDisplayValue('既存の確認用子牛');
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    expect(importer.latest?.currentInput.note).toContain('既存の成長メモ');

    await user.click(screen.getByRole('link', { name: '新規子牛へ移動' }));
    await waitFor(() => expect(screen.getByLabelText('名号')).toHaveValue(''));
    expect(screen.getByLabelText('個体識別番号')).toHaveValue('');
    expect(importer.latest?.currentInput).toMatchObject({
      calfNumber: '', identificationNumber: '', name: '', birthday: '', note: '',
      motherCowId: '', breedingMethod: '', breedingId: '', recipientCowId: '', recipientCowName: '',
      geneticMotherCowId: '', geneticMotherCowName: '', startWeight: 0, currentWeight: 0,
    });
    expect(importer.latest?.targetLabel).toBe('新しく登録する子牛');
    expect(importer.latest?.autoOpen).toBe(true);
    expect(importer.latest?.disabled).toBe(false);
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(screen.queryAllByText('登録証明書の内容を入力欄に反映しました。確認して保存してください。')).toHaveLength(0);
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(calfApi.createCalf).not.toHaveBeenCalled();

    nextCandidate = { ...nextCandidate, identificationNumber: '0987654321', earTag: '0999', name: '新規の確認用子牛' };
    await user.click(screen.getByRole('button', { name: '証明書の候補を反映' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findAllByText('登録しました。');
    expect(calfApi.createCalf).toHaveBeenCalledTimes(1);
    expect(calfApi.createCalf).toHaveBeenCalledWith(expect.objectContaining({
      identificationNumber: '0987654321', calfNumber: '0999', name: '新規の確認用子牛',
      breedingId: '', recipientCowId: '', startWeight: 0, currentWeight: 0,
    }));
    expect(calfApi.updateCalf).not.toHaveBeenCalled();
    expect(cattleApi.createCattle).not.toHaveBeenCalled();
  });
});
