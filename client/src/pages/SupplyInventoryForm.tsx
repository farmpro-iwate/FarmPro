import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, FormControlLabel, Checkbox, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { createSupplyMovement, SupplyAction, SupplyInput, SupplyKind } from '../services/supplyInventoryApi';

const actions: SupplyAction[] = ['購入', '使用', '廃棄', '棚卸増', '棚卸減'];
const today = () => new Date().toLocaleDateString('sv-SE');

export function SupplyInventoryForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialKind: SupplyKind = params.get('kind') === '受精卵' ? '受精卵' : '医薬品';
  const [form, setForm] = useState<SupplyInput>({
    kind: initialKind, action: '購入', date: today(), itemName: '', lotNumber: '',
    quantity: 1, unit: initialKind === '受精卵' ? '個' : '本',
    expiryDate: '', supplier: '', storageLocation: '', donorCow: '', sire: '',
    grade: '', cowEarTag: '', unitPrice: 0, amount: 0, paymentMethod: '現金', note: '',
  });
  const [recordExpense, setRecordExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof SupplyInput>(key: K, value: SupplyInput[K]) => setForm((old) => ({ ...old, [key]: value }));
  const purchasing = form.action === '購入';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try {
      await createSupplyMovement(form, recordExpense && purchasing);
      navigate('/supply-inventory?kind=' + encodeURIComponent(form.kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally { setSaving(false); }
  }

  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>購入・入出庫を記録</Typography>
    <Alert severity="info">購入は在庫を増やし、使用・廃棄は在庫を減らします。経費は購入時に限り任意で連動できます。</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    <Card><CardContent><Stack component="form" onSubmit={save} spacing={1.75}>
      <TextField select fullWidth label="種類" value={form.kind} onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value as SupplyKind, unit: e.target.value === '受精卵' ? '個' : '本' }))}>
        <MenuItem value="医薬品">医薬品</MenuItem><MenuItem value="受精卵">受精卵</MenuItem>
      </TextField>
      <TextField select fullWidth label="区分" value={form.action} onChange={(e) => { set('action', e.target.value as SupplyAction); setRecordExpense(false); }}>
        {actions.map((action) => <MenuItem key={action} value={action}>{action}</MenuItem>)}
      </TextField>
      <TextField fullWidth label="日付" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} InputLabelProps={{ shrink: true }} required />
      <TextField fullWidth label={form.kind === '医薬品' ? '医薬品名' : '受精卵名・品名'} value={form.itemName} onChange={(e) => set('itemName', e.target.value)} required />
      <TextField fullWidth label={form.kind === '医薬品' ? 'ロット番号' : '受精卵番号・管理番号'} value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} required />
      <Stack direction="row" spacing={1}>
        <TextField fullWidth label="数量" type="number" inputProps={{ min: 0.01, step: form.kind === '受精卵' ? 1 : 'any' }} value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} required />
        <TextField fullWidth select label="単位" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
          {(form.kind === '受精卵' ? ['個'] : ['本', '瓶', '箱', 'mL', '錠', '個']).map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
        </TextField>
      </Stack>
      <TextField fullWidth label={form.kind === '医薬品' ? '使用期限' : '有効期限・確認日（任意）'} type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField fullWidth label="保管場所" value={form.storageLocation} onChange={(e) => set('storageLocation', e.target.value)} placeholder={form.kind === '受精卵' ? '例：液体窒素タンクA' : '例：薬品庫・冷蔵庫'} />
      {form.kind === '受精卵' && <>
        <TextField fullWidth label="父牛" value={form.sire} onChange={(e) => set('sire', e.target.value)} />
        <TextField fullWidth label="供卵牛" value={form.donorCow} onChange={(e) => set('donorCow', e.target.value)} />
        <TextField fullWidth label="受精卵ランク" value={form.grade} onChange={(e) => set('grade', e.target.value)} />
      </>}
      {purchasing && <>
        <TextField fullWidth label="購入先" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
        <Stack direction="row" spacing={1}>
          <TextField fullWidth label="単価（円）" type="number" inputProps={{ min: 0 }} value={form.unitPrice} onChange={(e) => { const unitPrice = Number(e.target.value); setForm((prev) => ({ ...prev, unitPrice, amount: Math.round(unitPrice * prev.quantity) })); }} />
          <TextField fullWidth label="購入金額（円）" type="number" inputProps={{ min: 0 }} value={form.amount} onChange={(e) => set('amount', Number(e.target.value))} />
        </Stack>
        <FormControlLabel control={<Checkbox checked={recordExpense} onChange={(e) => setRecordExpense(e.target.checked)} />} label="購入費用を経費にも登録する（未登録の場合のみ）" />
        {recordExpense && <TextField select fullWidth label="支払方法" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
          {['現金', '口座振替', '銀行振込', 'クレジットカード', 'JA精算', 'その他'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
        </TextField>}
      </>}
      {!purchasing && <TextField fullWidth label="使用した牛の耳標番号（任意）" value={form.cowEarTag} onChange={(e) => set('cowEarTag', e.target.value)} />}
      <TextField fullWidth label="メモ" multiline minRows={2} value={form.note} onChange={(e) => set('note', e.target.value)} />
      <Button type="submit" disabled={saving} size="large" variant="contained">{saving ? '保存中…' : '内容を確認して保存'}</Button>
      <Button variant="outlined" onClick={() => navigate('/supply-inventory?kind=' + encodeURIComponent(form.kind))}>戻る</Button>
    </Stack></CardContent></Card>
  </Stack>;
}
