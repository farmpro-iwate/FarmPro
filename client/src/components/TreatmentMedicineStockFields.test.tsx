import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupplyBatch } from '../services/supplyInventoryApi';
import { TreatmentMedicineStockFields } from './TreatmentMedicineStockFields';

type Props = ComponentProps<typeof TreatmentMedicineStockFields>;
function batch(overrides: Partial<SupplyBatch> = {}): SupplyBatch {
  return {
    key: 'synthetic-stock-a', kind: '医薬品', itemName: '確認用薬A', lotNumber: '', unit: 'mL',
    expiryDate: '', storageLocation: '保管A', donorCow: '', sire: '', grade: '', balance: 20,
    ...overrides,
  };
}
function props(overrides: Partial<Props> = {}): Props {
  return {
    medicine: '確認用薬A', source: 'farm_stock', batches: [], loading: false, error: '',
    onSourceChange: vi.fn(), onReload: vi.fn(), onSelectBatch: vi.fn(), onQuantityChange: vi.fn(),
    ...overrides,
  };
}
const rechoose = () => screen.getByRole('button', { name: '在庫から薬を選び直す' });
const confirm = () => screen.getByRole('button', { name: 'この薬・在庫を使用する' });
async function pick(user: ReturnType<typeof userEvent.setup>, optionName: RegExp, query = '') {
  const dialog = screen.getByRole('dialog');
  const search = within(dialog).getByRole('combobox', { name: '医薬品在庫を検索' });
  await user.click(search);
  if (query) await user.type(search, query);
  await user.click(await within(dialog).findByRole('option', { name: optionName }));
}
let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('This controlled component must not call APIs'));
});
afterEach(() => {
  cleanup();
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('TreatmentMedicineStockFields', () => {
  it('投薬では薬剤名が空でも残量のある在庫から直接選べ、数量は自動入力しない', async () => {
    const user = userEvent.setup();
    const first = batch();
    const second = batch({ key: 'second-stock', itemName: '確認用薬B', unit: '本' });
    const value = props({
      inventoryFirst: true, medicine: '', batches: [first, second,
        batch({ key: 'empty', balance: 0 }), batch({ key: 'other-kind', kind: '受精卵' })],
    });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    expect(screen.getByLabelText('在庫からの使用数量')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '在庫から薬を選び直す' })).not.toBeInTheDocument();
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('combobox', { name: '使用する在庫・ロット' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
    await user.click(screen.getByRole('option', { name: /確認用薬B/ }));
    expect(value.onSelectBatch).toHaveBeenCalledExactlyOnceWith(second);
    expect(value.onQuantityChange).not.toHaveBeenCalled();
    rerender(<TreatmentMedicineStockFields {...value} medicine={second.itemName} selectedKey={second.key} />);
    expect(screen.getByLabelText('在庫からの使用数量')).toBeEnabled();
    expect(screen.getByLabelText('在庫からの使用数量')).toHaveValue(null);
    expect(screen.getByText('在庫の単位は「本」です。この単位で使用数量を入力してください。')).toBeInTheDocument();
  });

  it('読み込み中・取得失敗・在庫なしを区別し、失敗時も再読込と使用元の変更を利用できる', async () => {
    const user = userEvent.setup();
    const value = props({ loading: true });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    expect(screen.getByRole('status')).toHaveTextContent('読み込んでいます');
    expect(screen.queryByText(/選択できる医薬品の在庫がありません/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '在庫を再読み込み' })).toBeDisabled();
    rerender(<TreatmentMedicineStockFields {...value} loading={false} error="農場が変更されました。画面を開き直してください。" />);
    expect(screen.getByRole('alert')).toHaveTextContent('農場が変更されました。画面を開き直してください。');
    expect(screen.queryByText(/再読み込みしてください/)).not.toBeInTheDocument();
    expect(screen.queryByText(/残量がありません|在庫がありません/)).not.toBeInTheDocument();
    expect(rechoose()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '在庫を再読み込み' }));
    expect(value.onReload).toHaveBeenCalledOnce();
    const link = screen.getByRole('link', { name: '医薬品在庫を開く' });
    expect(link).toHaveAttribute('href', '/supply-inventory?kind=医薬品');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(screen.getByText(/治療の入力を残したまま、新しいタブ/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: '薬剤の使用元' }));
    await user.click(screen.getByRole('option', { name: '獣医師が処方・持参' }));
    expect(value.onSourceChange).toHaveBeenCalledWith('veterinarian');
    rerender(<TreatmentMedicineStockFields {...value} loading={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent('選択できる医薬品の在庫がありません。');
    expect(value.onSelectBatch).not.toHaveBeenCalled();
  });

  it('同名なしと残量なしを案内し、通常の候補は前後の空白を除いた完全一致に限る', async () => {
    const user = userEvent.setup();
    const matching = batch({ itemName: ' 確認用薬A ' });
    const nonmatching = batch({ key: 'other', itemName: '確認用薬A別名' });
    const zero = batch({ key: 'zero', balance: 0 });
    const embryo = batch({ key: 'embryo', kind: '受精卵' });
    const value = props({ medicine: ' 確認用薬A ', batches: [nonmatching] });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    expect(screen.getByRole('alert')).toHaveTextContent('同じ薬品名の在庫がありません');
    expect(rechoose()).toBeEnabled();
    rerender(<TreatmentMedicineStockFields {...value} batches={[zero]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('使用できる残量がありません');
    rerender(<TreatmentMedicineStockFields {...value} batches={[matching, nonmatching, zero, embryo]} />);
    await user.click(screen.getByRole('combobox', { name: '使用する在庫・ロット' }));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    const option = screen.getByRole('option', { name: /確認用薬A.*ロット未入力.*残り 20 mL.*保管場所：保管A/ });
    await user.click(option);
    expect(value.onSelectBatch).toHaveBeenCalledExactlyOnceWith(matching);
  });

  it('全在庫検索では薬名変更を知らせ、取消では反映せず明示確定した在庫だけを渡す', async () => {
    const user = userEvent.setup();
    const alternative = batch({ key: 'synthetic-stock-b', itemName: '確認用薬B', lotNumber: 'LOT-B', storageLocation: '保管B' });
    const value = props({ batches: [batch(), alternative] });
    render(<TreatmentMedicineStockFields {...value} />);
    await user.click(rechoose());
    expect(confirm()).toBeDisabled();
    await pick(user, /確認用薬B/, '確認用薬B 保管B');
    expect(screen.getByText(/薬剤名を「確認用薬B」に変更します。投薬量・休薬終了日は別途確認してください/)).toBeInTheDocument();
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    await user.click(rechoose());
    expect(confirm()).toBeDisabled();
    await pick(user, /確認用薬B/);
    await user.click(confirm());
    expect(value.onSelectBatch).toHaveBeenCalledExactlyOnceWith(alternative);
  });

  it('選択済みの残量0を保持し、数量の単位を示して空欄だけをundefinedとして渡す', async () => {
    const user = userEvent.setup();
    const used = batch({ balance: 0, unit: '本' });
    const value = props({ batches: [used], selectedKey: used.key, quantity: 0 });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    const select = screen.getByRole('combobox', { name: '使用する在庫・ロット' });
    expect(select).toHaveTextContent('確認用薬A');
    expect(select).toHaveTextContent('残り 0 本');
    expect(screen.getByLabelText('在庫からの使用数量')).toHaveValue(0);
    expect(screen.getByText('本', { selector: '.MuiInputAdornment-root p' })).toBeInTheDocument();
    expect(screen.getByText('在庫の単位は「本」です。この単位で使用数量を入力してください。')).toBeInTheDocument();
    await user.click(select);
    expect(screen.getByRole('option', { name: /確認用薬A/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    fireEvent.change(screen.getByLabelText('在庫からの使用数量'), { target: { value: '2.5' } });
    expect(value.onQuantityChange).toHaveBeenLastCalledWith(2.5);
    rerender(<TreatmentMedicineStockFields {...value} quantity={2.5} />);
    await user.clear(screen.getByLabelText('在庫からの使用数量'));
    expect(value.onQuantityChange).toHaveBeenLastCalledWith(undefined);
    expect(value.onSelectBatch).not.toHaveBeenCalled();
  });

  it('取得一覧にないkeyと薬名不一致の選択を勝手に消さず、確認が必要な状態で保持する', () => {
    const value = props({ batches: [batch()], selectedKey: 'unavailable-stock', quantity: 3 });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    expect(screen.getByRole('combobox', { name: '使用する在庫・ロット' })).toHaveTextContent('選択中の在庫（要再確認）');
    expect(screen.getByText(/選択中の在庫を取得した一覧で確認できません/)).toBeInTheDocument();
    expect(screen.getByLabelText('在庫からの使用数量')).toHaveValue(3);
    expect(screen.getByLabelText('在庫からの使用数量')).toBeDisabled();
    rerender(<TreatmentMedicineStockFields {...value} selectedKey="synthetic-stock-a" medicine="別の入力薬名" />);
    expect(screen.getByText(/選択中の在庫と入力した薬剤名が一致していません/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '使用する在庫・ロット' })).toHaveTextContent('確認用薬A');
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    expect(value.onQuantityChange).not.toHaveBeenCalled();
  });

  it('選択後の残量・取得状態を再照合し、更新された在庫を確定時に渡す', async () => {
    const user = userEvent.setup();
    const initial = batch();
    const value = props({ batches: [initial] });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    await user.click(rechoose());
    await pick(user, /確認用薬A/);
    rerender(<TreatmentMedicineStockFields {...value} loading />);
    expect(confirm()).toBeDisabled();
    rerender(<TreatmentMedicineStockFields {...value} error="在庫を確認できません。" />);
    expect(confirm()).toBeDisabled();
    rerender(<TreatmentMedicineStockFields {...value} batches={[{ ...initial, balance: 0 }]} />);
    expect(confirm()).toBeDisabled();
    expect(screen.getByText(/選んだ在庫の残量を確認できません/)).toBeInTheDocument();
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    const updated = { ...initial, balance: 12, storageLocation: '変更後の保管場所' };
    rerender(<TreatmentMedicineStockFields {...value} batches={[updated]} />);
    expect(confirm()).toBeEnabled();
    await user.click(confirm());
    expect(value.onSelectBatch).toHaveBeenCalledExactlyOnceWith(updated);
  });

  it('薬名や使用元が変わると開いていた候補確認を閉じ、保存中は変更できない', async () => {
    const user = userEvent.setup();
    const value = props({ batches: [batch()], selectedKey: 'synthetic-stock-a' });
    const { rerender } = render(<TreatmentMedicineStockFields {...value} />);
    await user.click(rechoose());
    await pick(user, /確認用薬A/);
    rerender(<TreatmentMedicineStockFields {...value} source="veterinarian" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('農場在庫は減らしません。')).toBeInTheDocument();
    expect(value.onSelectBatch).not.toHaveBeenCalled();
    rerender(<TreatmentMedicineStockFields {...value} disabled />);
    expect(screen.getByRole('combobox', { name: '薬剤の使用元' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('combobox', { name: '使用する在庫・ロット' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('在庫からの使用数量')).toBeDisabled();
    expect(rechoose()).toBeDisabled();
    expect(screen.getByRole('button', { name: '在庫を再読み込み' })).toBeDisabled();
  });
});
