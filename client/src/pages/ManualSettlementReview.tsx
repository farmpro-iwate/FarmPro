import { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getSale, SaleRecord } from '../services/salesApi';
import { getExpensesList, retryPendingExpenseSync, ExpenseRecord } from '../services/expensesApi';
import { getSavedSettlement, saveManualSettlement, type SavedSettlement } from '../services/manualSettlementSave';
import { reviewSettlement, SettlementDeduction } from '../utils/manualSettlement';
import { checkCloudSettlementStatus } from '../services/cloudSettlementStatus';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

const asYen = (value: string) => value.trim() === '' ? NaN : Number(value);
type Entry = { label: string; amount: string; expenseId: string; category: string };
const emptyEntry = (): Entry => ({ label: '', amount: '', expenseId: '', category: '手数料' });
const draftKey = (saleId: string) => `farmpro:settlement-draft:${saleId}`;
const yenText = (value: number) => Number.isFinite(value) ? `${value.toLocaleString('ja-JP')}円` : '未確定';
const previewDeductions: Entry[] = [
  { label: '市場手数料', amount: '16394', expenseId: '', category: '手数料' },
  { label: '家畜共済', amount: '500', expenseId: '', category: 'その他' },
  { label: '市場上場料', amount: '1100', expenseId: '', category: '手数料' },
  { label: 'JA販売手数料', amount: '14969', expenseId: '', category: '手数料' },
  { label: '施設使用料', amount: '8800', expenseId: '', category: 'その他' },
  { label: 'その他控除', amount: '3000', expenseId: '', category: 'その他' },
  { label: '繁殖協会費', amount: '1000', expenseId: '', category: 'その他' },
];
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
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const isMultiDevicePlan = getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
  const [cloudStatus, setCloudStatus] = useState('');
  useEffect(() => {
    if (!id) return;
    setCloudStatus('');
    if (isMultiDevicePlan) {
      void checkCloudSettlementStatus(id)
        .then((status) => setCloudStatus(status.registered
          ? `クラウドで登録済みの精算です（番号：${status.settlementNumber || '未設定'}）。追加登録はしないでください。`
          : 'クラウドに精算記録はありません。ただし複数端末の精算保存は安全確認中のため利用できません。'))
        .catch(() => setCloudStatus('クラウドの精算状況を確認できません。登録しないでください。'));
    }
    setDraftReady(false);
    Promise.all([getSale(id), getExpensesList(), getSavedSettlement(id)])
      .then(([s, e, previous]) => {
        setSale(s); setExpenses(e); setPreviousSettlement(previous);
        if (!previous) {
          try {
            const raw = sessionStorage.getItem(draftKey(s.id));
            if (raw) {
              const draft = JSON.parse(raw) as {
                saleNumber?: string; number?: string; net?: string; adjustment?: string;
                paymentDate?: string; vendor?: string; rows?: Entry[];
              };
              if (draft.saleNumber === s.targetNumber && Array.isArray(draft.rows) &&
                  draft.rows.length > 0 && draft.rows.length <= 100 &&
                  draft.rows.every((row) => typeof row.label === 'string' &&
                    typeof row.amount === 'string' && typeof row.expenseId === 'string' &&
                    typeof row.category === 'string')) {
                setRows(draft.rows);
                setNumber(draft.number || '');
                setNet(draft.net || '');
                setAdjustment(draft.adjustment ?? '0');
                setPaymentDate(draft.paymentDate || '');
                setVendor(draft.vendor || '');
                setDraftRestored(true);
              }
            }
          } catch (restoreError) {
            console.warn('精算の一時入力を復元できませんでした。', restoreError);
          }
        }
        setDraftReady(true);
        // Retry only the already-created pending expenses; never rerun settlement save.
        if (previous?.expenseIdsCreated?.length) {
          void retryPendingExpenseSync(previous.expenseIdsCreated).catch((syncError) => {
            console.warn('精算経費の同期再試行を保留しました。', syncError);
          });
        }
      })
      .catch(() => setError('記録の読み込みに失敗しました。'));
  }, [id, isMultiDevicePlan]);
  useEffect(() => {
    if (!draftReady || !sale || previousSettlement || saved) return;
    try {
      sessionStorage.setItem(draftKey(sale.id), JSON.stringify({
        saleNumber: sale.targetNumber, number, net, adjustment, paymentDate, vendor, rows,
      }));
    } catch (draftError) {
      console.warn('精算の一時入力を保持できませんでした。', draftError);
    }
  }, [draftReady, sale, previousSettlement, saved, number, net, adjustment, paymentDate, vendor, rows]);
  const linkedIds = rows.map((r) => r.expenseId).filter(Boolean);
  const rowKeys = rows.filter((r) => r.label.trim() && r.amount.trim())
    .map((r) => `${r.label.trim().toLocaleLowerCase()}|${r.amount.trim()}`);
  const hasDuplicateRows = new Set(rowKeys).size !== rowKeys.length;
  const hasEmptyRows = rows.some((r) => !r.label.trim() || !r.amount.trim());
  const hasUnverifiedExistingExpense = rows.some((row) => {
    if (!row.expenseId) return false;
    const expense = expenses.find((item) => item.id === row.expenseId);
    const numbers = expense ? [expense.animalEarTag, expense.target].map((n) => String(n || '').trim()).filter(Boolean) : [];
    return !sale?.targetNumber || numbers.length === 0 || numbers.some((n) => n !== sale.targetNumber);
  });
  const totalDeductions = rows.reduce((sum, r) =>
    sum + (r.amount.trim() && Number.isSafeInteger(Number(r.amount)) ? Number(r.amount) : 0), 0);
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
    if (!sale || previousSettlement || hasDuplicateRows || hasEmptyRows || hasUnverifiedExistingExpense || !review.matchesStatement || !paymentDate || !vendor.trim() || saving || saved) return;
    const newTotal = review.newExpenses.reduce((sum, item) => sum + item.amountYen, 0);
    const existingDetails = rows.filter((row) => row.expenseId).map((row) => {
      const existing = expenses.find((item) => item.id === row.expenseId);
      return `・${existing?.description || row.label}：${Number(row.amount).toLocaleString('ja-JP')}円（${existing?.paymentDate || '日付不明'}）`;
    }).join('\n');
    const summary = `販売記録：${sale.targetName || sale.targetNumber}（耳標${sale.targetNumber}）\n精算番号：${number}\n新規経費：${review.newExpenses.length}件・${newTotal.toLocaleString('ja-JP')}円\n既存経費：${review.linkedExistingExpenses.length}件（変更なし）\n${existingDetails || '・なし'}\n\n登録済み経費が、この牛の精算書に属することを確認してください。\n差引精算額：${review.calculatedNetYen.toLocaleString('ja-JP')}円\n\n上記の新規経費だけを登録しますか？`;
    if (!window.confirm(summary)) return;
    setSaving(true);
    setError('');
    try {
      await saveManualSettlement({
        saleId: sale.id, expectedTargetNumber: sale.targetNumber, settlementNumber: number, grossYen: asYen(sale.salePrice),
        expectedNetYen: asYen(net), adjustmentYen: asYen(adjustment),
        deductions: rows.map((row) => ({ label: row.label, amountYen: asYen(row.amount), existingExpenseId: row.expenseId || undefined })),
        expensesToCreate: rows.flatMap((row, index) => row.expenseId ? [] : [{
          deductionIndex: index, paymentDate, category: row.category, description: row.label,
          vendor, amount: row.amount, paymentMethod: 'JA精算', target: sale.targetNumber,
          memo: `精算No.${number} / ${sale.targetName} / 耳標${sale.targetNumber}`,
        }]), confirmed: true,
      });
      setSaved(true);
      try { sessionStorage.removeItem(draftKey(sale.id)); } catch { /* local storage restrictions do not affect committed save */ }
      // The local transaction has committed. A read or cloud error must never retry settlement.
      try {
        const committed = await getSavedSettlement(sale.id);
        setPreviousSettlement(committed);
        if (committed?.expenseIdsCreated?.length) {
          void retryPendingExpenseSync(committed.expenseIdsCreated).catch((syncError) => {
            console.warn('精算経費のクラウド同期を保留しました。', syncError);
          });
        }
      } catch {
        // Saving already succeeded: do not report a false save error or allow a retry.
        setError('登録は完了しましたが、保存内容を読み直せませんでした。画面を再読み込みして確認してください。');
      }
    } catch (e) { setError(e instanceof Error ? e.message : '一括登録に失敗しました。'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h5" fontWeight={800}>販売精算・手入力確認</Typography>
    <Alert severity="info">登録前に明細を確認してください。既存の販売・経費は削除せず、新規経費だけを登録します。</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {draftRestored && !previousSettlement && <Alert severity="info">このタブの前回入力を復元しました。既存経費の紐づけと金額を再確認してください。正式保存はされていません。</Alert>}
    {previousSettlement && <Alert severity="info">この販売は精算登録済みです。精算番号：{previousSettlement.settlementNumber} ／ 差引：{previousSettlement.expectedNetYen?.toLocaleString('ja-JP') ?? '記録なし'}円。再登録はできません。</Alert>}
    {previousSettlement && <Card variant="outlined"><CardContent><Stack spacing={1}>
      <Typography fontWeight={800}>登録済み精算の内容（閲覧のみ）</Typography>
      <Typography>精算番号：{previousSettlement.settlementNumber}</Typography>
      <Typography>販売額：{previousSettlement.grossYen?.toLocaleString('ja-JP') ?? '記録なし'}円</Typography>
      {previousSettlement.deductions?.map((d, i) =>
        <Typography key={i}>{d.label}：{d.amountYen.toLocaleString('ja-JP')}円{d.existingExpenseId ? '（登録済み経費を再利用）' : ''}</Typography>)}
      <Typography>調整額：{previousSettlement.adjustmentYen?.toLocaleString('ja-JP') ?? '記録なし'}円</Typography>
      <Typography fontWeight={800}>差引精算額：{previousSettlement.expectedNetYen?.toLocaleString('ja-JP') ?? '記録なし'}円</Typography>
    </Stack></CardContent></Card>}
    {!previousSettlement && <Card><CardContent><Stack spacing={2}>
      <Typography fontWeight={800}>{sale?.targetName || '読み込み中'}（{sale?.targetNumber || '-'}）</Typography>
      <Typography>販売金額：{sale?.salePrice || '-'}円（登録済み記録）</Typography>
      <TextField label="精算番号" value={number} onChange={(e) => setNumber(e.target.value)} />
      <TextField label="差引精算額（円）" value={net} onChange={(e) => setNet(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Typography fontWeight={800}>控除明細（{rows.length}件）</Typography>
      <Alert severity="info">ワクチンの接種日とJA精算日は異なる場合があります。種類・接種日ごとの記録を確認し、登録済み経費があれば紐づけて二重計上を防いでください。</Alert>
      {sale?.targetNumber === 'TEST5953' && <Stack spacing={1}>
        <Button variant="outlined" onClick={() => {
          const current = rows.filter((row) => row.label.trim() || row.amount.trim() || row.expenseId);
          if (current.some((row) => !row.label.trim() || !row.amount.trim())) {
            setError('入力途中の明細があります。先に内容を確認してください。'); return;
          }
          const additions = previewDeductions.filter((row) =>
            !current.some((existing) => existing.label.trim() === row.label && existing.amount.trim() === row.amount));
          if (additions.length === 0) { setError('検証用の控除7件はすでに追加されています。'); return; }
          if (!window.confirm('検証用の控除7件を入力欄にセットします。保存はしません。原伝票の金額・科目を必ず確認してください。')) return;
          setRows([...current, ...additions]);
          setError('');
        }}>検証用：残り7件をまとめて入力欄にセット（保存しません）</Button>
        <Alert severity="warning">TEST5953専用の入力補助です。経費科目は仮の分類です。原伝票に照らして確認し、実際の農場では使用しないでください。</Alert>
      </Stack>}
      {rows.map((row, i) => <Card key={i} variant="outlined" sx={{ bgcolor: !row.label.trim() || !row.amount.trim() ? 'action.hover' : 'background.paper' }}><CardContent sx={{ p: { xs: 1.5, md: 1 }, '&:last-child': { pb: { xs: 1.5, md: 1 } } }}><Stack spacing={1}>
        <Typography fontWeight={700}>控除 {i + 1}：{row.label || '未入力'} {row.amount.trim() ? `／ ${row.amount}円` : ''}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField label="控除名" size="small" fullWidth sx={{ flex: { md: 3 } }} value={row.label} onChange={(e) => updateRow(i, { label: e.target.value })} error={!row.label.trim()} />
          <TextField label="控除額（税込円）" size="small" fullWidth sx={{ flex: { md: 1.5 } }} value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} inputProps={{ inputMode: 'numeric' }} error={!row.amount.trim()} />
          {!row.expenseId && <TextField label="新規経費の科目" size="small" select fullWidth sx={{ flex: { md: 2 } }} value={row.category} onChange={(e) => updateRow(i, { category: e.target.value })}>
            {['手数料', '医薬品費', 'その他', '診療費', '種付け・繁殖費'].map((category) => <MenuItem value={category} key={category}>{category}</MenuItem>)}
          </TextField>}
        </Stack>
        <TextField label="登録済み経費と紐づけ（任意）" select value={row.expenseId} onChange={(e) => {
          const selected = expenses.find((x) => x.id === e.target.value);
          updateRow(i, selected ? { expenseId: selected.id, label: selected.description, amount: selected.amount } : { expenseId: '' });
        }}>
          <MenuItem value="">新規経費候補（まだ保存しない）</MenuItem>
          {expenses.filter((e) => e.id === row.expenseId || !linkedIds.includes(e.id)).map((e) =>
            <MenuItem key={e.id} value={e.id}>{e.description} / {e.amount}円 / 経費日：{e.paymentDate || '未登録'} / 対象：{e.animalEarTag || e.target || '未登録'}</MenuItem>)}
        </TextField>
        {row.expenseId && (() => {
          const linked = expenses.find((e) => e.id === row.expenseId);
          if (!linked) return <Alert severity="warning">選択した既存経費が見つかりません。</Alert>;
          const target = (linked.animalEarTag || linked.target || '').trim();
          const numbers = [linked.animalEarTag, linked.target].map((n) => String(n || '').trim()).filter(Boolean);
          const missing = numbers.length === 0;
          const mismatch = Boolean(sale?.targetNumber && numbers.some((n) => n !== sale.targetNumber));
          return <Stack spacing={1}>
            <Alert severity={missing || mismatch ? 'warning' : 'info'}>
              既存経費：{linked.description}／{linked.amount}円／経費日：{linked.paymentDate || '未登録'}
              ／対象番号：{target || '未登録'}。接種日は経費日と異なる場合があります。
              {missing ? ' 対象牛が未登録です。メモや金額だけでは紐づけられません。' : ''}
              {mismatch ? ' 対象番号が販売牛と異なります。紐づけできません。' : ''}
              {!missing && !mismatch ? ' 原記録でワクチンの種類・接種日・対象牛を確認してください。' : ''}
            </Alert>
            {(missing || mismatch) && <Button component={RouterLink} to={`/expenses/${linked.id}/edit`} variant="outlined" size="small">
              経費記録を開いて対象牛を確認する（自動変更しません）
            </Button>}
          </Stack>;
        })()}
        <Button color="error" variant="outlined" disabled={rows.length === 1} onClick={() => setRows((old) => old.filter((_, index) => index !== i))}>この明細を除く</Button>
      </Stack></CardContent></Card>)}
      {hasEmptyRows && <Alert severity="warning">未入力の控除があります。入力するか「この明細を除く」で整理してください。</Alert>}
      {hasDuplicateRows && <Alert severity="warning">同じ控除名・金額が複数あります。重複でないか確認してください。重複したまま保存はできません。</Alert>}
      {hasUnverifiedExistingExpense && <Alert severity="error">紐づけ先の経費に対象牛の未登録・不一致があります。確認が済むまで一括登録できません。既存経費は自動変更しません。</Alert>}
      <Button variant="outlined" disabled={hasEmptyRows} onClick={() => setRows((old) => [...old, emptyEntry()])}>＋ 控除を1件追加</Button>
      <TextField label="JA精算日（接種日とは別）" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
      <TextField label="支払先" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      <TextField label="調整額（加算は＋、減算は－）" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      <Card variant="outlined"><CardContent><Stack spacing={1}>
        <Typography fontWeight={800}>精算金額の確認</Typography>
        <Typography>販売金額：{yenText(asYen(sale?.salePrice || ''))}</Typography>
        <Typography>控除合計（{rows.length}件）：－{yenText(totalDeductions)}</Typography>
        <Typography>調整額：{yenText(asYen(adjustment))}（プラスは加算）</Typography>
        <Typography variant="h6" fontWeight={800}>計算上の差引：{review.errors.some((e) => e.startsWith('控除明細')) ? '未確定' : yenText(review.calculatedNetYen)}</Typography>
        <Typography>伝票の差引精算額：{yenText(asYen(net))}</Typography>
        <Typography fontWeight={700} color={review.matchesStatement && !hasDuplicateRows ? 'success.main' : 'text.secondary'}>{review.matchesStatement && !hasDuplicateRows ? '✓ 金額一致' : '明細・入力金額を確認してください'}</Typography>
      </Stack></CardContent></Card>
      <Typography>登録済み経費：{review.linkedExistingExpenses.length}件 ／ 新規経費候補：{review.newExpenses.length}件</Typography>
      {review.matchesStatement ? <Alert severity="success">入力された金額は一致しています。ただし、伝票原本・個体・重複の最終確認は未実施です。</Alert> :
        review.errors.map((message, i) => <Alert severity="warning" key={i}>{message}</Alert>)}
      {saved && <Alert severity="success">新規経費の一括登録が完了しました。</Alert>}
      {isMultiDevicePlan && <Alert severity="warning">{cloudStatus || 'クラウドの精算状況を確認中です。保存はできません。'}</Alert>}
      <Button variant="contained" disabled={isMultiDevicePlan || !review.matchesStatement || hasDuplicateRows || hasEmptyRows || !paymentDate || !vendor.trim() || saving || saved || !!previousSettlement || !sale} onClick={handleSave}>
        {saving ? '登録中...' : saved ? '登録済み' : '確認して新規経費を一括登録'}
      </Button>
      <Alert severity="info">登録済み経費は複製・削除しません。既存のワクチン接種記録や販売記録も変更しません。</Alert>
      <Button component={RouterLink} to={sale ? `/sales/${sale.id}/edit` : '/sales'} variant="outlined">販売編集へ戻る</Button>
    </Stack></CardContent></Card>}
  </Stack>;
}
