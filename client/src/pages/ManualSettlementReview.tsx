import { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getSale, SaleRecord } from '../services/salesApi';
import { getExpensesList, ExpenseRecord } from '../services/expensesApi';
import { reviewSettlement, SettlementDeduction } from '../utils/manualSettlement';

const asYen = (value: string) => value.trim() === '' ? NaN : Number(value);
type Entry = { label: string; amount: string; expenseId: string };
export function ManualSettlementReview() {
  const { id } = useParams();
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [error, setError] = useState('');
  const [number, setNumber] = useState('');
  const [net, setNet] = useState('');
  const [adjustment, setAdjustment] = useState('0');
  const [rows, setRows] = useState<Entry[]>([{ label: '', amount: '', expenseId: '' }]);
  useEffect(() => {
    if (!id) return;
    Promise.all([getSale(id), getExpensesList()])
      .then(([s, e]) => { setSale(s); setExpenses(e); })
      .catch(() => setError('記録の読み込みに失敗しました。'));
  }, [id]);
  const linkedIds = rows.map((r) => r.expenseId).filter(Boolean);
  const review = useMemo(() => reviewSettlement({
    saleId: sale?.id || '',
    settlementNumber: number,
    grossYen: asYen(sale?.salePrice || ''),
    expectedNetYen: asYen(net),
    adjustmentYen: asYen(adjustment),
    deductions: rows.map((row): SettlementDeduction => ({
      label: row.label,
      amountYen: asYen(row.amount),
      existingExpenseId: row.expenseId || undefined,
    })),
  }), [sale, number, net, adjustment, rows]);
  const updateRow = (i: number, update: Partial<Entry>) =>
    setRows((previous) => previous.map((row, index) => index === i ? { ...row, ...update } : row));
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>販売精算・手入力確認</Typography>
    <Alert severity="info">現在は照合専用です。入力内容は保存されず、既存の販売記録・経費記録も変更しません。</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    <Card><CardContent><Stack spacing={2}>
      <Typography fontWeight={800}>{sale?.targetName || '読み込み中'}（{sale?.targetNumber || '-'}）</Typography>
      <Typography>販売金額：{sale?.salePrice || '-'}円（登録済み記録）</Typography>
      <TextField label="精算番号" value={number} onChange={(e) => setNumber(e.target.value)} />
      <TextField label="差引精算額（円）" value={net} onChange={(e) => setNet(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Typography fontWeight={800}>控除明細</Typography>
      {rows.map((row, i) => <Card key={i} variant="outlined"><CardContent><Stack spacing={1}>
        <TextField label="控除名" value={row.label} onChange={(e) => updateRow(i, { label: e.target.value })} />
        <TextField label="控除額（税込円）" value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} inputProps={{ inputMode: 'numeric' }} />
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
      <Button variant="outlined" onClick={() => setRows((old) => [...old, { label: '', amount: '', expenseId: '' }])}>控除項目を追加</Button>
      <TextField label="税額・相殺等の調整額（円・符号あり）" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Typography fontWeight={800}>計算上の差引：{Number.isFinite(review.calculatedNetYen) ? review.calculatedNetYen.toLocaleString('ja-JP') + '円' : '未確定'}</Typography>
      <Typography>登録済み経費：{review.linkedExistingExpenses.length}件 ／ 新規経費候補：{review.newExpenses.length}件</Typography>
      {review.matchesStatement ? <Alert severity="success">入力された金額は一致しています。ただし、伝票原本・個体・重複の最終確認は未実施です。</Alert> :
        review.errors.map((message, i) => <Alert severity="warning" key={i}>{message}</Alert>)}
      <Alert severity="info">正式な一括保存は未実装です。登録済み経費は複製せず、削除もしません。</Alert>
      <Button component={RouterLink} to={sale ? `/sales/${sale.id}/edit` : '/sales'} variant="outlined">販売編集へ戻る</Button>
    </Stack></CardContent></Card>
  </Stack>;
}
