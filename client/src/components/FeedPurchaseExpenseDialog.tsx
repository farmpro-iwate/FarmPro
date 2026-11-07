import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { FeedInventoryRecord } from '../services/feedInventoryApi';
import { paymentMethodOptions, type ExpenseRecord } from '../services/expensesApi';
import {
  createFeedPurchaseExpense,
  findMatchingFeedPurchaseExpenses,
  isLinkableFeedPurchaseExpense,
  linkFeedPurchaseExpense,
  loadFeedPurchaseExpenseReview,
  type FeedPurchaseExpenseInput,
  type FeedPurchaseExpenseReview,
} from '../services/feedPurchaseExpenses';

type Props = {
  record: FeedInventoryRecord | null;
  onClose: () => void;
  onSaved?: (expense: ExpenseRecord) => void;
};

const fieldGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
  minWidth: 0,
};

function yen(value: string) {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount)
    ? amount.toLocaleString('ja-JP') + '円'
    : '未入力';
}

function samePurchaseAmount(purchase: FeedInventoryRecord, expense: ExpenseRecord) {
  const amount = Number(purchase.totalPrice);
  return purchase.totalPrice.trim() !== '' && Number.isFinite(amount) && amount > 0 &&
    Number(expense.amount) === amount;
}

function initialInput(purchase: FeedInventoryRecord): FeedPurchaseExpenseInput {
  return {
    paymentDate: '',
    paymentMethod: '',
    amount: purchase.totalPrice || '',
    vendor: purchase.supplier || '',
    description: purchase.feedName + ' 購入',
    memo: '',
    allowSeparatePayment: false,
  };
}

function Detail({ label, value }: { label: string; value: string }) {
  return <Box sx={{ minWidth: 0 }}>
    <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value || '未入力'}</Typography>
  </Box>;
}

function ExpenseDetails({ expense }: { expense: ExpenseRecord }) {
  return <Box component="dl" sx={{ ...fieldGrid, m: 0, gap: 1.5 }}>
    <Detail label="支払日" value={expense.paymentDate} />
    <Detail label="金額" value={yen(expense.amount)} />
    <Detail label="支払先" value={expense.vendor} />
    <Detail label="支払方法" value={expense.paymentMethod} />
    <Box sx={{ gridColumn: '1 / -1' }}><Detail label="内容" value={expense.description} /></Box>
    {expense.memo && <Box sx={{ gridColumn: '1 / -1' }}><Detail label="メモ" value={expense.memo} /></Box>}
  </Box>;
}

/** Remount each purchase so another record never inherits a payment confirmation. */
export function FeedPurchaseExpenseDialog(props: Props) {
  if (!props.record) return null;
  return <PurchaseExpenseDialog
    key={props.record.id + ':' + props.record.updatedAt}
    {...props}
    record={props.record}
  />;
}

function PurchaseExpenseDialog({ record, onClose, onSaved }: Props & { record: FeedInventoryRecord }) {
  const titleId = useId();
  const descriptionId = useId();
  const modeLabelId = useId();
  const formId = useId();
  const [review, setReview] = useState<FeedPurchaseExpenseReview | null>(null);
  const [form, setForm] = useState<FeedPurchaseExpenseInput>(() => initialInput(record));
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [confirmedLink, setConfirmedLink] = useState(false);
  const [savedExpense, setSavedExpense] = useState<ExpenseRecord | null>(null);
  const [savedMode, setSavedMode] = useState<'new' | 'existing' | null>(null);
  const [error, setError] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const mounted = useRef(false);
  const savingRef = useRef(false);
  const savedRef = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSaveFailed(false);
    setReview(null);
    loadFeedPurchaseExpenseReview(record.id).then(value => {
      if (!active) return;
      setReview(value);
      setForm(initialInput(value.purchase));
      setSelectedExpenseId('');
      setConfirmedLink(false);
      setMode('new');
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : '経費を確認できませんでした。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [record.id, reload]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (savedExpense) resultRef.current?.focus(); }, [savedExpense]);

  const linkedExpense = savedExpense || review?.linkedExpense;
  const matchingExpenses = useMemo(() => review && !linkedExpense
    ? findMatchingFeedPurchaseExpenses(review, form)
    : [], [review, form, linkedExpense]);
  const candidates = useMemo(() => {
    if (!review) return [];
    return review.expenses.filter(isLinkableFeedPurchaseExpense).sort((left, right) =>
      Number(samePurchaseAmount(review.purchase, right)) - Number(samePurchaseAmount(review.purchase, left)) ||
      right.paymentDate.localeCompare(left.paymentDate));
  }, [review]);
  const selectedExpense = candidates.find(expense => expense.id === selectedExpenseId);
  const hasDifferentAmounts = Boolean(review && candidates.some(expense => !samePurchaseAmount(review.purchase, expense)));

  function updateField<K extends keyof FeedPurchaseExpenseInput>(key: K, value: FeedPurchaseExpenseInput[K]) {
    setForm(previous => ({ ...previous, [key]: value, allowSeparatePayment: false }));
    setError('');
  }

  function changeMode(value: 'new' | 'existing') {
    setMode(value);
    setConfirmedLink(false);
    setForm(previous => ({ ...previous, allowSeparatePayment: false }));
    setError('');
  }

  function close() {
    if (!savingRef.current) onClose();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!review || loading || savingRef.current || savedRef.current || linkedExpense) return;
    setError('');
    if (mode === 'new') {
      if (!form.paymentDate) { setError('実際の支払日を入力してください。'); return; }
      if (!form.paymentMethod) { setError('支払方法を選択してください。'); return; }
      if (!form.amount.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
        setError('金額は0より大きい数字で入力してください。'); return;
      }
      if (!form.description.trim()) { setError('内容を入力してください。'); return; }
      if (matchingExpenses.length && !form.allowSeparatePayment) {
        setError('登録済みの経費を確認し、別の支払いの場合だけ新しく登録してください。'); return;
      }
    } else if (!selectedExpense || !samePurchaseAmount(review.purchase, selectedExpense) || !confirmedLink) {
      setError('同じ支払いの経費を選び、内容を確認してください。'); return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const expense = mode === 'new'
        ? await createFeedPurchaseExpense(review, form)
        : await linkFeedPurchaseExpense(review, selectedExpenseId);
      if (!mounted.current) return;
      savedRef.current = true;
      setSavedExpense(expense);
      setSavedMode(mode);
      onSaved?.(expense);
    } catch (err) {
      if (mounted.current) {
        setSaveFailed(true);
        setConfirmedLink(false);
        setForm(previous => ({ ...previous, allowSeparatePayment: false }));
        setError(err instanceof Error ? err.message : '経費を保存できませんでした。');
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return <Dialog
    open
    onClose={close}
    fullWidth
    maxWidth="sm"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    PaperProps={{ sx: { m: 1.5, width: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' } }}
  >
    <DialogTitle id={titleId} sx={{ fontWeight: 800 }}>飼料購入の経費を確認</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2.5} sx={{ minWidth: 0 }}>
        <Typography id={descriptionId} variant="body2" color="text.secondary">
          {linkedExpense
            ? 'この入庫に関連付けられた経費です。'
            : '入庫は保存済みです。支払いの内容を確認してから経費に登録します。'}
        </Typography>
        {loading && <Typography role="status">購入内容と経費を読み込み中…</Typography>}
        {error && <Alert severity="error" ref={errorRef} tabIndex={-1}>{error}</Alert>}
        {saveFailed && review && !linkedExpense && <Stack spacing={0.5}>
          <Button onClick={() => setReload(value => value + 1)} variant="outlined" disabled={saving} sx={{ minHeight: 44 }}>
            最新の内容を読み直す
          </Button>
          <Typography variant="caption" color="text.secondary">読み直すと、入力中の支払内容は初期表示に戻ります。</Typography>
        </Stack>}
        {!loading && !review && <Button onClick={() => setReload(value => value + 1)} variant="outlined" sx={{ minHeight: 44 }}>
          読み直す
        </Button>}
        {review && <>
          <Box component="section" aria-label="保存済みの購入内容" sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Typography fontWeight={800} sx={{ mb: 1.5 }}>{review.purchase.feedName}</Typography>
            <Box component="dl" sx={{ ...fieldGrid, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', m: 0, gap: 1.5 }}>
              <Detail label="入庫日" value={review.purchase.transactionDate} />
              <Detail label="数量" value={review.purchase.quantity + ' ' + review.purchase.unit} />
              <Detail label="購入金額（税込）" value={yen(review.purchase.totalPrice)} />
              <Detail label="仕入先" value={review.purchase.supplier} />
            </Box>
          </Box>

          {linkedExpense ? <>
            <Alert severity="success" ref={resultRef} tabIndex={-1}>
              {savedMode === 'new' ? '経費に登録しました。' : savedMode === 'existing'
                ? '登録済みの経費と関連付けました。' : 'この入庫には経費が関連付けられています。'}
            </Alert>
            <ExpenseDetails expense={linkedExpense} />
            <Button component={RouterLink} to={'/expenses/' + encodeURIComponent(linkedExpense.id) + '/edit'}
              target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ minHeight: 44 }}>
              経費を開く
            </Button>
            <Typography variant="caption" color="text.secondary">経費は別のタブで開きます。</Typography>
          </> : <Box component="form" id={formId} onSubmit={save} noValidate>
            <Stack component="fieldset" spacing={2.5} disabled={saving}
              sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}>
              <FormControl disabled={saving}>
                <FormLabel id={modeLabelId}>経費への反映方法</FormLabel>
                <RadioGroup aria-labelledby={modeLabelId} value={mode}
                  onChange={event => changeMode(event.target.value as 'new' | 'existing')}>
                  <FormControlLabel value="new" control={<Radio disabled={saving} />} label="新しく経費を登録" sx={{ minHeight: 44 }} />
                  <FormControlLabel value="existing" control={<Radio disabled={saving} />} label="登録済みの経費を選ぶ" sx={{ minHeight: 44 }} />
                </RadioGroup>
              </FormControl>
              {mode === 'new' ? <>
                <Typography variant="body2">経費科目：飼料費 ／ 対象：農場全体</Typography>
                <Box sx={fieldGrid}>
                  <TextField label="支払日" type="date" value={form.paymentDate}
                    onChange={event => updateField('paymentDate', event.target.value)}
                    InputLabelProps={{ shrink: true }} helperText="実際に支払った日を入力してください" fullWidth required disabled={saving} />
                  <TextField label="支払方法" select value={form.paymentMethod}
                    onChange={event => updateField('paymentMethod', event.target.value)}
                    InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }} fullWidth required disabled={saving}>
                    <MenuItem value="" disabled>選択してください</MenuItem>
                    {paymentMethodOptions.map(method => <MenuItem key={method} value={method} sx={{ minHeight: 44 }}>{method}</MenuItem>)}
                  </TextField>
                  <TextField label="金額（税込・円）" value={form.amount}
                    onChange={event => updateField('amount', event.target.value)}
                    inputProps={{ inputMode: 'decimal' }} helperText="請求書などの支払金額を確認してください" fullWidth required disabled={saving} />
                  <TextField label="支払先" value={form.vendor}
                    onChange={event => updateField('vendor', event.target.value)} fullWidth disabled={saving} />
                  <TextField label="内容" value={form.description}
                    onChange={event => updateField('description', event.target.value)}
                    sx={{ gridColumn: '1 / -1' }} fullWidth required disabled={saving} />
                  <TextField label="メモ（任意）" value={form.memo}
                    onChange={event => updateField('memo', event.target.value)}
                    sx={{ gridColumn: '1 / -1' }} multiline minRows={2} fullWidth disabled={saving} />
                </Box>
                {matchingExpenses.length > 0 && <Alert severity="warning">
                  <Stack spacing={1.5}>
                    <Typography variant="body2">同じ支払日・金額・支払先の経費があります。登録済みの支払いか確認してください。</Typography>
                    {matchingExpenses.map(expense => <Box key={expense.id}>
                      <Typography variant="body2" fontWeight={700}>{expense.description || '飼料費'}</Typography>
                      <Typography variant="body2">{expense.paymentDate} ／ {expense.vendor || '支払先未入力'} ／ {yen(expense.amount)}</Typography>
                    </Box>)}
                    <FormControlLabel
                      control={<Checkbox checked={Boolean(form.allowSeparatePayment)} disabled={saving}
                        onChange={event => setForm(previous => ({ ...previous, allowSeparatePayment: event.target.checked }))} />}
                      label="表示された経費とは別の支払いです"
                      sx={{ m: 0, minHeight: 44, alignItems: 'flex-start' }}
                    />
                  </Stack>
                </Alert>}
              </> : <>
                <Typography variant="body2">同じ購入の支払いを選びます。選んだ経費の金額や支払日は変わりません。</Typography>
                {candidates.length === 0 ? <Alert severity="info">関連付けできる飼料費がありません。未登録の支払いは「新しく経費を登録」から入力してください。</Alert> : <>
                  <TextField select label="登録済みの飼料費" value={selectedExpenseId} fullWidth disabled={saving}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiSelect-select': { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}
                    SelectProps={{
                      displayEmpty: true,
                      renderValue: () => selectedExpense
                        ? selectedExpense.paymentDate + ' ／ ' + (selectedExpense.vendor || '支払先未入力') + ' ／ ' + yen(selectedExpense.amount)
                        : '選択してください',
                      MenuProps: { PaperProps: { sx: { maxHeight: 360, maxWidth: 'calc(100vw - 32px)' } } },
                    }}
                    onChange={event => { setSelectedExpenseId(event.target.value); setConfirmedLink(false); setError(''); }}
                  >
                    <MenuItem value="" disabled>選択してください</MenuItem>
                    {candidates.map(expense => <MenuItem key={expense.id} value={expense.id}
                      disabled={!samePurchaseAmount(review.purchase, expense)}
                      sx={{ minHeight: 44, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700}>{expense.description || '飼料費'}</Typography>
                        <Typography variant="body2">{expense.paymentDate} ／ {expense.vendor || '支払先未入力'} ／ {yen(expense.amount)}</Typography>
                        {!samePurchaseAmount(review.purchase, expense) && <Typography variant="caption">購入金額と異なるため選択できません</Typography>}
                      </Box>
                    </MenuItem>)}
                  </TextField>
                  {hasDifferentAmounts && <Typography variant="body2" color="text.secondary">
                    購入金額と異なる経費は選べません。まとめ払いの関連付けは、この画面では行えません。
                  </Typography>}
                  {selectedExpense && <>
                    <ExpenseDetails expense={selectedExpense} />
                    <FormControlLabel control={<Checkbox checked={confirmedLink} disabled={saving}
                      onChange={event => setConfirmedLink(event.target.checked)} />}
                      label="同じ支払いであることを確認しました" sx={{ minHeight: 44, alignItems: 'flex-start' }} />
                  </>}
                </>}
              </>}
            </Stack>
          </Box>}
        </>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column', sm: 'row' },
      '& > .MuiButton-root': { minHeight: 44, width: { xs: '100%', sm: 'auto' }, m: '0 !important' } }}>
      <Button onClick={close} disabled={saving} variant="outlined">閉じる</Button>
      {review && !linkedExpense && <Button type="submit" form={formId} variant="contained"
        disabled={saving || (mode === 'new'
          ? matchingExpenses.length > 0 && !form.allowSeparatePayment
          : !selectedExpense || !confirmedLink || !samePurchaseAmount(review.purchase, selectedExpense))}>
        {saving ? '保存中…' : mode === 'new' ? '経費を登録' : 'この経費と関連付ける'}
      </Button>}
    </DialogActions>
  </Dialog>;
}
