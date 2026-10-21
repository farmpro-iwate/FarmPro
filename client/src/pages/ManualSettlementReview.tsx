import { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getSale, SaleRecord } from '../services/salesApi';
import { getExpensesList, ExpenseRecord } from '../services/expensesApi';
import { getSavedSettlement, saveManualSettlement, type SavedSettlement } from '../services/manualSettlementSave';
import { reviewSettlement, SettlementDeduction } from '../utils/manualSettlement';

const asYen = (value: string) => value.trim() === '' ? NaN : Number(value);
type Entry = { label: string; amount: string; expenseId: string; category: string };
const emptyEntry = (): Entry => ({ label: '', amount: '', expenseId: '', category: '手数料' });
export function ManualSettlementReview() {
  const { id } = useParams();
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previousSettlement, setPreviousSettlement] = useState<SavedSettlement | null>(null);
  const [paymentDate, setPaymentDate] = useState('');
  const [vendor, setVendor] = useState('');
  const [number, setNumber] = useState('');
  const [net, setNet] = useState('');
  const [adjustment, setAdjustment] = useState('0');
  const [rows, setRows] = useState<Entry[]>([emptyEntry()]);
  useEffect(() => {
    if (!id) return;
    Promise.all([getSale(id), getExpensesList(), getSavedSettlement(id)])
      .then(([s, e, previous]) => { setSale(s); setExpenses(e); setPreviousSettlement(previous); })
      .catch(() => setError('記録の読み込みに失敗しました。'));
  }, [id]);
  const linkedIds = rows.map((r) => r.expenseId).filter(Boolean);
  const review = useMemo(() => reviewSettlement({
    saleId: sale?.id || '',
    settlementNumber: number,
    grossYen: asYen(sale?.salePrice || ''),
    expectedNetYen: asYen(net),
    adjustmentYen: asYen(adjustment),
    existingExpenses: expenses.map((e) => ({ id: e.id, amount: e.amount })),
    deductions: rows.map((row): SettlementDeduction => ({
      label: row.label,
      amountYen: asYen(row.amount),
      existingExpenseId: row.expenseId || undefined,
    })),
  }), [sale, number, net, adjustment, rows, expenses]);
  const updateRow = (i: number, update: Partial<Entry>) =>
    setRows((previous) => previous.map((row, index) => index === i ? { ...row, ...update } : row));
  async function handleSave() {
    if (!sale || !review.matchesStatement || !paymentDate || !vendor.trim() || saving || saved) return;
    const newTotal = review.newExpenses.reduce((sum, item) => sum + item.amountYen, 0);
    const summary = `販売記録：${sale.targetName || sale.targetNumber}\n精算番号：${number}\n新規経費：${review.newExpenses.length}件・${newTotal.toLocaleString('ja-JP')}円\n既存経費：${review.linkedExistingExpenses.length}件（変更なし）\n差引精算額：${review.calculatedNetYen.toLocaleString('ja-JP')}円\n\n上記の新規経費だけを登録しますか？`;
    if (!window.confirm(summary)) return;
    setSaving(true);
    setError('');
    try {
      await saveManualSettlement({
        saleId: sale.id, settlementNumber: number, grossYen: asYen(sale.salePrice),
        expectedNetYen: asYen(net), adjustmentYen: asYen(adjustment),
        deductions: rows.map((row) => ({ label: row.label, amountYen: asYen(row.amount), existingExpenseId: row.expenseId || undefined })),
        expensesToCreate: rows.flatMap((row, index) => row.expenseId ? [] : [{
          deductionIndex: index, paymentDate, category: row.category, description: row.label,
          vendor, amount: row.amount, paymentMethod: 'JA精算', target: sale.targetNumber,
          memo: `精算No.${number} / ${sale.targetName} / 耳標${sale.targetNumber}`,
        }]), confirmed: true,
      });
      setSaved(true);
      setPreviousSettlement(await getSavedSettlement(sale.id));
    } catch (e) { setError(e instanceof Error ? e.message : '一括登録に失敗しました。'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>販売精算・手入力確認</Typography>
    <Alert severity="info">登録前に明細を確認してください。既存の販売・経費は削除せず、新規経費だけを登録します。</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {previousSettlement && <Alert severity="info">この販売は精算登録済みです。精算番号：{previousSettlement.settlementNumber} ／ 差引：{previousSettlement.expectedNetYen?.toLocaleString('ja-JP') ?? '記録なし'}円。再登録はできません。</Alert>}
    <Card><CardContent><Stack spacing={2}>
      <Typography fontWeight={800}>{sale?.targetName || '読み込み中'}（{sale?.targetNumber || '-'}）</Typography>
      <Typography>販売金額：{sale?.salePrice || '-'}円（登録済み記録）</Typography>
      <TextField label="精算番号" value={number} onChange={(e) => setNumber(e.target.value)} />
      <TextField label="差引精算額（円）" value={net} onChange={(e) => setNet(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Typography fontWeight={800}>控除明細</Typography>
      {rows.map((row, i) => <Card key={i} variant="outlined"><CardContent><Stack spacing={1}>
        <TextField label="控除名" value={row.label} onChange={(e) => updateRow(i, { label: e.target.value })} />
        <TextField label="控除額（税込円）" value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} inputProps={{ inputMode: 'numeric' }} />
        {!row.expenseId && <TextField label="新規経費の科目" select value={row.category} onChange={(e) => updateRow(i, { category: e.target.value })}>
          {['手数料', '医薬品費', 'その他', '診療費', '種付け・繁殖費'].map((c) => <MenuItem value={c} key={c}>{c}</MenuItem>)}
        </TextField>}
        <TextField label="登録済み経費と紐づけ（任意）" select value={row.expenseId} onChange={(e) => {
          const selected = expenses.find((x) => x.id === e.target.value);
          updateRow(i, selected ? { expenseId: selected.id, label: selected.description, amount: selected.amount } : { expenseId: '' });
        }}>
          <MenuItem value="">新規経費候補（まだ保存しない）</MenuItem>
          {expenses.filter((e) => e.id === row.expenseId || !linkedIds.includes(e.id)).map((e) =>
            <MenuItem key={e.id} value={e.id}>{e.paymentDate} / {e.description} / {e.amount}円</MenuItem>)}
        </TextField>
        <Button color="error" variant="outlined" disabled={rows.length === 1} onClick={() => setRows((old) => old.filter((_, index) => index !== i))}>この明細を除く</Button>
      </Stack></CardContent></Card>)}
      <Button variant="outlined" onClick={() => setRows((old) => [...old, emptyEntry()])}>控除項目を追加</Button>
      <TextField label="経費の支払日（精算日）" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField label="支払先" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      <TextField label="税額・相殺等の調整額（円・符号あり）" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Typography fontWeight={800}>計算上の差引：{Number.isFinite(review.calculatedNetYen) ? review.calculatedNetYen.toLocaleString('ja-JP') + '円' : '未確定'}</Typography>
      <Typography>登録済み経費：{review.linkedExistingExpenses.length}件 ／ 新規経費候補：{review.newExpenses.length}件</Typography>
      {review.matchesStatement ? <Alert severity="success">入力された金額は一致しています。ただし、伝票原本・個体・重複の最終確認は未実施です。</Alert> :
        review.errors.map((message, i) => <Alert severity="warning" key={i}>{message}</Alert>)}
      {saved && <Alert severity="success">新規経費の一括登録が完了しました。</Alert>}
      <Button variant="contained" disabled={!review.matchesStatement || !paymentDate || !vendor.trim() || saving || saved || !!previousSettlement || !sale} onClick={handleSave}>
        {saving ? '登録中...' : saved ? '登録済み' : '確認して新規経費を一括登録'}
      </Button>
      <Alert severity="info">登録済み経費は複製・削除しません。既存のワクチン接種記録や販売記録も変更しません。</Alert>
      <Button component={RouterLink} to={sale ? `/sales/${sale.id}/edit` : '/sales'} variant="outlined">販売編集へ戻る</Button>
    </Stack></CardContent></Card>
  </Stack>;
}
