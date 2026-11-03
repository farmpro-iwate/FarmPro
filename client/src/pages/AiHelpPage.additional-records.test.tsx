import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiHelpPage } from './AiHelpPage';
import { SupplyInventoryForm } from './SupplyInventoryForm';
import { AI_RECORD_FORM_DEFINITIONS, type AiRecordFormKind } from '../ai/recordFormDraft';
import * as supplies from '../services/supplyInventoryApi';
import * as cattle from '../services/api';
import * as breeding from '../services/breedingApi';

function setOwner(farmId = 'ai-fixture-farm') {
  localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'ai-fixture-user', farmId, farmName: '試験用農場', name: '試験利用者',
    email: 'ai-fixture@example.invalid', role: 'owner', active: true, plan: 'free',
  }));
}

function Destination() {
  const location = useLocation();
  return <div data-testid="destination">{JSON.stringify({ path: location.pathname, state: location.state })}</div>;
}

function mount() {
  return render(<MemoryRouter initialEntries={['/ai-help?mode=record']}><Routes>
    <Route path="/ai-help" element={<AiHelpPage />} />
    <Route path="/supply-inventory/new" element={<SupplyInventoryForm />} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter>);
}

async function request(text: string) {
  fireEvent.change(screen.getByLabelText('登録したい内容を入力'), { target: { value: text } });
  await userEvent.click(screen.getByRole('button', { name: 'AIで記録' }));
}

beforeEach(() => { setOwner(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('AIで記録の追加項目', () => {
  it.each<[AiRecordFormKind, string]>([
    ['medicine-inventory', '医薬品の試験薬を10.5分包購入した'],
    ['embryo-inventory', '受精卵を2個購入、受精卵番号E-12'],
    ['sale', '子牛1234を80万円で販売した'],
    ['expense', '昨日、電気代5000円を支払った'],
    ['blv', '耳標1234、BLV検査は陰性'],
    ['feeding-action', '子牛1234の給与アラートに対応、給与量を増やした'],
    ['fattening', '耳標1234を肥育へ移行した'],
    ['cattle', '牛を登録、耳標1234、名号は試験牛、2025年1月2日生まれ'],
    ['calf', '子牛を登録、子牛番号5678、2026年11月1日生まれ'],
    ['feeding', '飼料給与記録、飼料名は試験飼料、給与量10kg、対象は子牛群'],
    ['treatment', '子牛1234の削蹄を記録'],
    ['vaccine', '子牛1234にワクチン接種した'],
  ])('%sを候補にし、候補作成では保存も通信もしない', async (kind, text) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const save = vi.spyOn(supplies, 'createSupplyMovement');
    const lookup = vi.spyOn(cattle, 'getCattleList');
    mount();
    await request(text);
    const definition = AI_RECORD_FORM_DEFINITIONS.find(item => item.kind === kind)!;
    expect(await screen.findByRole('heading', { name: definition.label + 'の入力候補' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登録画面で確認・修正する' })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('医薬品の分包・小数を通常フォームへ渡し、利用者の保存操作でだけ登録する', async () => {
    const create = vi.spyOn(supplies, 'createSupplyMovement').mockResolvedValue({ id: 'isolated-supply' } as any);
    mount();
    await request('2026年11月3日、医薬品の試験薬を10.5分包購入、購入金額2000円');
    await userEvent.click(await screen.findByRole('button', { name: '登録画面で確認・修正する' }));
    expect(await screen.findByLabelText('医薬品名', { exact: false })).toHaveValue('試験薬');
    expect(screen.getByLabelText('数量', { exact: false })).toHaveValue(10.5);
    expect(screen.getByLabelText('日付', { exact: false })).toHaveValue('2026-11-03');
    expect(screen.getByLabelText('購入金額（円）')).toHaveValue(2000);
    expect(screen.getByRole('checkbox', { name: /購入費用を経費にも登録/ })).not.toBeChecked();
    expect(create).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '内容を確認して保存' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      kind: '医薬品', action: '購入', itemName: '試験薬', quantity: 10.5, unit: '分包', amount: 2000,
    }), false);
  });

  it('種類を選んだ入力も候補にし、IDを推測せず登録画面へ渡す', async () => {
    mount();
    await userEvent.click(screen.getByRole('combobox', { name: '記録する項目' }));
    await userEvent.click(screen.getByRole('option', { name: '経費' }));
    await request('支払日2026-11-03、内容:修理、金額:5000円');
    await userEvent.click(await screen.findByRole('button', { name: '登録画面で確認・修正する' }));
    const destination = JSON.parse((await screen.findByTestId('destination')).textContent!);
    expect(destination.path).toBe('/expenses/new');
    expect(destination.state.farmproAiDraft.kind).toBe('expense');
    expect(destination.state.farmproAiDraft.fields.amount).toBe('5000');
    expect(destination.state.farmproAiDraft.fields).not.toHaveProperty('id');
  });

  it('候補を作った後の入力変更・取消で古い候補を使わせない', async () => {
    mount();
    await request('受精卵を2個購入');
    await screen.findByRole('button', { name: '登録画面で確認・修正する' });
    fireEvent.change(screen.getByLabelText('登録したい内容を入力'), { target: { value: '経費を登録' } });
    expect(screen.queryByRole('button', { name: '登録画面で確認・修正する' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'AIで記録' }));
    await screen.findByRole('button', { name: '登録画面で確認・修正する' });
    await userEvent.click(screen.getByRole('button', { name: '登録をやめる' }));
    expect(screen.queryByRole('button', { name: '登録画面で確認・修正する' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('登録したい内容を入力')).toHaveValue('');
  });

  it('候補作成後に農場が変わったら登録画面へ渡さない', async () => {
    mount();
    await request('医薬品を購入');
    const open = await screen.findByRole('button', { name: '登録画面で確認・修正する' });
    setOwner('other-fixture-farm');
    await userEvent.click(open);
    expect(await screen.findByText(/利用者または農場が変わりました/)).toBeInTheDocument();
    expect(screen.queryByLabelText('医薬品名', { exact: false })).not.toBeInTheDocument();
  });

  it('既存の発情対話は維持し、確認前に繁殖記録を保存しない', async () => {
    vi.spyOn(cattle, 'getCattleList').mockResolvedValue([{ id: 8, earTag: '1234', name: '試験牛' }] as any);
    const create = vi.spyOn(breeding, 'createBreeding');
    mount();
    await request('1234、発情を登録して');
    expect(await screen.findByRole('button', { name: 'はい、今日です' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登録画面で確認・修正する' })).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('AIに聞くの画面へ記録種類の選択を混ぜない', () => {
    render(<MemoryRouter initialEntries={['/ai-help']}><AiHelpPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'AIに聞く' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '記録する項目' })).not.toBeInTheDocument();
  });
});
