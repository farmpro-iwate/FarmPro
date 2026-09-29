import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlvForm } from './BlvForm';
import * as blvApi from '../services/blvApi';

vi.mock('../components/CattlePicker', () => ({
  CattlePicker: ({ onSelect }: any) => (
    <button type="button" onClick={() => onSelect({ earTag: '9130', name: 'はな' })}>
      牛を選ぶ
    </button>
  ),
}));

describe('BlvForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => cleanup());

  it('耳標番号・牛名がない場合は保存しない', async () => {
    const create = vi.spyOn(blvApi, 'createBlvTest').mockResolvedValue({ id: 1 } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BlvForm mode="create" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(alertSpy).toHaveBeenCalledWith('耳標番号、牛名は必須です');
    expect(create).not.toHaveBeenCalled();
  });

  it('牛選択後に検査結果を登録してreturnToへ戻る', async () => {
    const create = vi.spyOn(blvApi, 'createBlvTest').mockResolvedValue({ id: 1 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/blv/new?returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/blv/new" element={<BlvForm mode="create" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '牛を選ぶ' }));
    await user.type(screen.getByLabelText(/検査日/), '2026-09-29');
    await user.click(screen.getByRole('combobox', { name: /検査結果/ }));
    await user.click(screen.getByRole('option', { name: '陰性' }));
    await user.type(screen.getByLabelText(/次回検査予定日/), '2027-09-29');
    await user.type(screen.getByLabelText(/備考/), '年次検査');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      testDate: '2026-09-29',
      result: '陰性',
      nextTestDate: '2027-09-29',
      note: '年次検査',
    }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });

  it('既存BLV記録を編集できる', async () => {
    vi.spyOn(blvApi, 'getBlvTest').mockResolvedValue({
      id: 5,
      cowEarTag: '9130',
      cowName: 'はな',
      testDate: '2026-09-01',
      result: '未検査',
      nextTestDate: '',
      isolationMemo: '',
      note: '元データ',
    } as any);
    const update = vi.spyOn(blvApi, 'updateBlvTest').mockResolvedValue({ id: 5 } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/blv/5/edit']}>
        <Routes>
          <Route path="/blv/:id/edit" element={<BlvForm mode="edit" />} />
          <Route path="/blv" element={<div>BLV一覧へ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'BLV検査記録を編集' });
    await user.click(screen.getByRole('combobox', { name: /検査結果/ }));
    await user.click(screen.getByRole('option', { name: '陽性' }));
    await user.type(screen.getByLabelText(/陽性牛の隔離メモ/), '別群管理');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(update).toHaveBeenCalledWith('5', expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      result: '陽性',
      isolationMemo: '別群管理',
      note: '元データ',
    }));
    expect(await screen.findByText('BLV一覧へ戻った')).toBeInTheDocument();
  });

  it('編集画面で確認後に削除してreturnToへ戻る', async () => {
    vi.spyOn(blvApi, 'getBlvTest').mockResolvedValue({
      id: 5,
      cowEarTag: '9130',
      cowName: 'はな',
      testDate: '2026-09-01',
      result: '陰性',
      nextTestDate: '',
      isolationMemo: '',
      note: '',
    } as any);
    const del = vi.spyOn(blvApi, 'deleteBlvTest').mockResolvedValue(undefined as any);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/blv/5/edit?returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/blv/:id/edit" element={<BlvForm mode="edit" />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'BLV検査記録を編集' });
    await user.click(screen.getByRole('button', { name: '削除' }));

    expect(del).toHaveBeenCalledWith(5);
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });
});
