import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { isAnimalDeceased } from '../utils/animalLifecycle';
import { animalLifecycleLabel } from '../utils/animalLifecycleDisplay';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  createFeedInventory,
  emptyFeedInventoryInput,
  FeedInventoryInput,
  type FeedInventoryRecord,
  type FeedInventorySourceType,
  feedInventoryTransactionTypeOptions,
  feedInventoryUnitOptions
} from '../services/feedInventoryApi';
import {
  type FeedAllocationTargetType
} from '../services/feedCostAllocation';
import { buildFeedCostingSnapshot } from '../services/feedCostingSnapshot';
import { getFarmSettings } from '../services/settingsApi';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';
import type { FeedAllocationTargetAnimal } from '../services/feedAllocationTargets';
import type { FarmTaxRate } from '../types/settings';
import { FeedSearchField } from '../components/FeedSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';
import { FeedDocumentImport } from '../components/FeedDocumentImport';
import { FeedPurchaseExpenseDialog } from '../components/FeedPurchaseExpenseDialog';
import { FeedPurchasePaymentFields } from '../components/FeedPurchasePaymentFields';
import { assertExpenseSyncContext, expenseSyncContext } from '../services/expensesApi';
import {
  prepareFeedPurchaseExpense, bindFeedPurchaseExpenseReview,
  createFeedPurchaseExpense, linkFeedPurchaseExpense,
  type FeedPurchaseExpensePreflight,
} from '../services/feedPurchaseExpenses';
import { normalizeFeedDocumentCandidate, validateFeedDocumentLine, validateFeedDocumentInput,
  type FeedDocumentSelection } from '../utils/feedDocumentImport';
import { feedDocumentInputKey, findPotentialFeedDocumentDuplicates } from '../utils/feedDocumentEntry';
import { getStoredAuthUser } from '../services/authClient';
import { getAllRecords } from '../storage/repository';

type DocumentOwner = { farmId: string; userId: string };

const allocationTargetOptions: Array<{ value: FeedAllocationTargetType; label: string }> = [
  { value: 'farm', label: '農場全体' },
  { value: 'calfGroup', label: '子牛群' },
  { value: 'growingCattleGroup', label: '育成牛群' },
  { value: 'breedingCattleGroup', label: '繁殖牛群' },
  { value: 'individual', label: '個体' },
];

const taxRateOptions: Array<{ value: FarmTaxRate; label: string }> = [
  { value: '10', label: '10%' },
  { value: '8', label: '8%' },
  { value: '0', label: '非課税' },
];

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function todayDateValue() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function FeedInventoryForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const useMode = searchParams.get('mode') === 'use';
  const openedForDocument = !useMode && searchParams.get('source') === 'feed-document';
  const [formOwner] = useState(() => getStoredAuthUser());
  const [paymentOwner] = useState(expenseSyncContext);
  const [documentOwner, setDocumentOwner] = useState<DocumentOwner | null>(null);
  const documentOwnerRef = useRef<DocumentOwner | null>(null);
  const [documentSelection, setDocumentSelection] = useState<FeedDocumentSelection>();
  const [documentInput, setDocumentInput] = useState<FeedInventoryInput | null>(null);
  const [completedLines, setCompletedLines] = useState<Record<number, string>>({});
  const [savedDocumentRecordId, setSavedDocumentRecordId] = useState('');
  const [savedPurchaseRecord, setSavedPurchaseRecord] = useState<FeedInventoryRecord | null>(null);
  const [expenseRecord, setExpenseRecord] = useState<FeedInventoryRecord | null>(null);
  const savedPurchaseRef = useRef<FeedInventoryRecord | null>(null);
  const expensePendingRef = useRef(false);
  const [expensePending, setExpensePending] = useState(false);
  const [expenseComplete, setExpenseComplete] = useState(false);
  const [expenseEnabled, setExpenseEnabled] = useState(!openedForDocument);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [expensePreflight, setExpensePreflight] = useState<FeedPurchaseExpensePreflight | null>(null);
  const [expenseReviewOnly, setExpenseReviewOnly] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState('');
  const [allowSeparatePayment, setAllowSeparatePayment] = useState(false);
  const expenseReviewNeedsRefresh = useRef(true);
  const documentStatusRef = useRef<HTMLDivElement | null>(null);
  const documentErrorRef = useRef<HTMLDivElement | null>(null);
  const savingRef = useRef(false);
  const [possibleDuplicates, setPossibleDuplicates] = useState<FeedInventoryRecord[]>([]);
  const [duplicateKey, setDuplicateKey] = useState('');
  const [confirmedDuplicateKey, setConfirmedDuplicateKey] = useState<string | null>(null);
  const [form, setForm] = useState<FeedInventoryInput>(() => {
    if (!useMode) return emptyFeedInventoryInput;

    return {
      ...emptyFeedInventoryInput,
      transactionDate: todayDateValue(),
      transactionType: '出庫',
      feedName: searchParams.get('feedName') || '',
      unit: searchParams.get('unit') || 'kg',
      bagWeightKg: searchParams.get('bagWeightKg') || '',
      supplier: searchParams.get('supplier') || '',
    };
  });
  const [allocationTarget, setAllocationTarget] = useState<FeedAllocationTargetType>('farm');
  const [individualOptions, setIndividualOptions] = useState<Array<FeedAllocationTargetAnimal & { key: string; label: string }>>([]);
  const [selectedIndividualKey, setSelectedIndividualKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function requireDocumentOwner() {
    const expected = documentOwnerRef.current;
    if (!expected) return;
    const current = getStoredAuthUser();
    if (!current?.farmId || current.farmId !== expected.farmId || (current.id || '') !== expected.userId) {
      throw new Error('ログイン中の農場が変わりました。画面を開き直してください。');
    }
  }

  function applyFeedDocument(selection: FeedDocumentSelection) {
    if (savingRef.current || useMode) throw new Error('登録処理中は書類を反映できません。');
    if (expensePendingRef.current) throw new Error('保存済みの入庫の経費を確認するか、「経費はあとで確認」を選んでください。');
    const owner = getStoredAuthUser();
    if (!owner?.farmId || !formOwner?.farmId || owner.farmId !== formOwner.farmId ||
        (owner.id || '') !== (formOwner.id || '')) {
      throw new Error('ログイン中の農場を確認して、画面を開き直してください。');
    }
    requireDocumentOwner();
    if (!selection.sessionId?.trim() || selection.sessionId.length > 200) throw new Error('読み取り候補を確認し直してください。');
    const sameDocument = selection.sessionId === documentSelection?.sessionId;
    if (sameDocument && completedLines[selection.lineIndex]) throw new Error('この品目は入庫登録済みです。別の品目を選んでください。');
    const candidate = normalizeFeedDocumentCandidate(selection.candidate);
    const checked = validateFeedDocumentLine(candidate, selection.lineIndex);
    if (checked.errors.length || !checked.input) throw new Error(checked.errors.join(' / ') || '入庫内容を確認してください。');
    const nextOwner = { farmId: owner.farmId, userId: owner.id || '' };
    documentOwnerRef.current = nextOwner;
    setDocumentOwner(nextOwner);
    setDocumentSelection({ ...selection, candidate });
    setDocumentInput(checked.input);
    setForm({ ...emptyFeedInventoryInput, ...checked.input });
    if (!sameDocument) setCompletedLines({});
    savedPurchaseRef.current = null;
    setSavedDocumentRecordId('');
    setSavedPurchaseRecord(null);
    expensePendingRef.current = false;
    setExpensePending(false);
    setExpenseComplete(false);
    setExpenseEnabled(false);
    setPaymentDate(''); setPaymentMethod('');
    resetExpenseReview();
    setPossibleDuplicates([]); setDuplicateKey(''); setConfirmedDuplicateKey(null);
    setError('');
  }

  useEffect(() => {
    if (!savedDocumentRecordId || expensePending) return;
    documentStatusRef.current?.focus({ preventScroll: true });
    documentStatusRef.current?.scrollIntoView?.({ block: 'start' });
  }, [savedDocumentRecordId, expensePending]);

  useEffect(() => {
    if (!error) return;
    documentErrorRef.current?.focus({ preventScroll: true });
    documentErrorRef.current?.scrollIntoView?.({ block: 'start' });
  }, [error]);

  useEffect(() => {
    if (allocationTarget !== 'individual') {
      setSelectedIndividualKey('');
      return;
    }

    Promise.all([
      getCattleList().catch(() => []),
      getCalfList().catch(() => []),
    ]).then(([cattle, calves]) => {
      const cattleOptions = cattle.filter(animal => !isAnimalDeceased(animal)).map((animal) => ({
        key: `cattle:${animal.id}`,
        label: `${animalLifecycleLabel(animal) || (animal.stage === '育成牛' ? '育成牛' : '繁殖牛')}｜${animal.earTag || '-'} ${animal.name || ''}`.trim(),
        animalType: 'cattle' as const,
        animalId: String(animal.id),
        earTag: animal.earTag || '',
        animalName: animal.name || '',
        weight: 1,
      }));
      const calfOptions = calves
        .filter((calf) => !isAnimalDeceased(calf) && !['販売済み', '牛台帳へ移行済み'].includes(calf.managementStatus))
        .map((calf) => ({
          key: `calf:${calf.id}`,
          label: `子牛｜${calf.calfNumber || calf.temporaryCalfNumber || '-'} ${calf.name || ''}`.trim(),
          animalType: 'calf' as const,
          animalId: String(calf.id),
          earTag: calf.calfNumber || calf.temporaryCalfNumber || '',
          animalName: calf.name || '',
          weight: 1,
        }));
      setIndividualOptions([...cattleOptions, ...calfOptions]);
    });
  }, [allocationTarget]);

  useEffect(() => {
    if (useMode || openedForDocument) return;

    getFarmSettings()
      .then((settings) => {
        if (documentOwnerRef.current) return;
        const defaultTaxRate = settings.defaultTaxRate || '10';
        setForm((prev) => ({
          ...prev,
          taxRate: prev.taxRate || defaultTaxRate,
        }));
      })
      .catch((err) => {
        if (documentOwnerRef.current) return;
        console.warn('基本消費税率の読み込みをスキップしました。', err);
        setForm((prev) => ({ ...prev, taxRate: prev.taxRate || '10' }));
      });
  }, [useMode, openedForDocument]);

  function updateField<K extends keyof FeedInventoryInput>(key: K, value: FeedInventoryInput[K]) {
    if (savingRef.current || savedPurchaseRef.current) return;
    setPossibleDuplicates([]); setDuplicateKey(''); setConfirmedDuplicateKey(null);
    resetExpenseReview();
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetExpenseReview() {
    setExpensePreflight(null);
    setExpenseReviewOnly(false);
    setSelectedExpenseId('');
    setAllowSeparatePayment(false);
    expenseReviewNeedsRefresh.current = true;
  }

  const calculatedTotalPrice = useMemo(() => {
    const quantity = numberValue(form.quantity);
    const unitPrice = numberValue(form.unitPrice);
    if (quantity <= 0 || unitPrice <= 0) return '';
    return String(Math.round(quantity * unitPrice));
  }, [form.quantity, form.unitPrice]);

  const displayedTotalPrice = form.totalPrice || calculatedTotalPrice;
  const isHomegrownInbound = form.transactionType === '入庫' && form.sourceType === 'homegrown';
  const isPurchasedInbound = !useMode && form.transactionType === '入庫' && !isHomegrownInbound;
  const stockFieldsDisabled = saving || Boolean(savedPurchaseRecord);

  const taxBreakdown = useMemo(() => {
    if (documentInput && form.transactionType === '入庫' && form.sourceType === 'purchased' &&
        displayedTotalPrice === documentInput.totalPrice && form.taxRate === documentInput.taxRate) {
      return { taxExcludedPrice: documentInput.taxExcludedPrice || '', taxAmount: documentInput.taxAmount || '' };
    }
    if (documentOwner && !form.taxRate) return { taxExcludedPrice: '', taxAmount: '' };
    if (isHomegrownInbound) {
      const productionCost = numberValue(displayedTotalPrice);
      return {
        taxExcludedPrice: productionCost > 0 ? String(Math.round(productionCost)) : '',
        taxAmount: productionCost > 0 ? '0' : '',
      };
    }
    if (form.transactionType !== '入庫') {
      return { taxExcludedPrice: '', taxAmount: '' };
    }

    const grossPrice = numberValue(displayedTotalPrice);
    if (documentOwner && displayedTotalPrice.trim() && grossPrice === 0 && form.taxRate) {
      return { taxExcludedPrice: '0', taxAmount: '0' };
    }
    if (grossPrice <= 0) {
      return { taxExcludedPrice: '', taxAmount: '' };
    }

    const taxRate = form.taxRate || '10';
    if (taxRate === '0') {
      const price = String(Math.round(grossPrice));
      return { taxExcludedPrice: price, taxAmount: '0' };
    }

    const rate = Number(taxRate) / 100;
    const taxExcludedPrice = Math.round(grossPrice / (1 + rate));
    const taxAmount = Math.round(grossPrice - taxExcludedPrice);

    return {
      taxExcludedPrice: String(taxExcludedPrice),
      taxAmount: String(taxAmount),
    };
  }, [displayedTotalPrice, form.taxRate, form.transactionType, form.sourceType, isHomegrownInbound, documentInput, documentOwner]);

  const calculatedTotalWeightKg = useMemo(() => {
    if (form.unit !== '袋') return '';
    const bags = numberValue(form.quantity);
    const weightPerBag = numberValue(form.bagWeightKg);
    if (bags <= 0 || weightPerBag <= 0) return '';
    return String(bags * weightPerBag);
  }, [form.unit, form.quantity, form.bagWeightKg]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (savingRef.current || (savedPurchaseRef.current && !expensePendingRef.current)) return;
    setError('');

    if (!form.transactionDate) {
      setError('入出庫日を入力してください。');
      return;
    }
    if (!form.feedName.trim()) {
      setError('飼料名を入力してください。例：配合飼料');
      return;
    }
    if (!form.quantity.trim()) {
      setError('数量を入力してください。');
      return;
    }
    if (Number.isNaN(Number(form.quantity))) {
      setError('数量は数字で入力してください。例：10');
      return;
    }
    if (form.unit === '袋' && (!form.bagWeightKg || Number(form.bagWeightKg) <= 0)) {
      setError('1袋の重量をkgで入力してください。例：20');
      return;
    }
    if (form.unitPrice && Number.isNaN(Number(form.unitPrice))) {
      setError('単価は数字で入力してください。例：80');
      return;
    }
    if (form.totalPrice && Number.isNaN(Number(form.totalPrice))) {
      setError('金額は数字で入力してください。例：40000');
      return;
    }

    const submitData: FeedInventoryInput = {
      ...form,
      sourceType: form.transactionType === '入庫' ? (form.sourceType || 'purchased') : undefined,
      supplier: isHomegrownInbound ? '' : form.supplier,
      taxRate: form.transactionType === '入庫'
        ? (isHomegrownInbound ? '0' : (documentOwner ? form.taxRate : (form.taxRate || '10')))
        : undefined,
      taxExcludedPrice: form.transactionType === '入庫' ? taxBreakdown.taxExcludedPrice : '',
      taxAmount: form.transactionType === '入庫' ? taxBreakdown.taxAmount : '',
      totalWeightKg: form.unit === '袋' ? calculatedTotalWeightKg : '',
      totalPrice: displayedTotalPrice
    };

    savingRef.current = true;
    setSaving(true);
    try {
      requireDocumentOwner();
      const saveExpense = isPurchasedInbound && expenseEnabled;
      if (saveExpense) assertExpenseSyncContext(paymentOwner);
      if (documentOwner && !savedPurchaseRef.current) {
        const inputErrors = validateFeedDocumentInput(submitData);
        if (inputErrors.length) throw new Error(inputErrors.join(' / '));
        // This path is read-only; getFeedInventoryList also reconciles old costs.
        const existing = await getAllRecords<FeedInventoryRecord>('feedInventory');
        requireDocumentOwner();
        const duplicates = findPotentialFeedDocumentDuplicates(submitData, existing);
        const key = JSON.stringify([feedDocumentInputKey(submitData), duplicates.map(row => row.id).sort()]);
        setPossibleDuplicates(duplicates); setDuplicateKey(key);
        if (duplicates.length && confirmedDuplicateKey !== key) {
          throw new Error('同じ日付・飼料・数量の入庫があります。登録済みの納品ではないか確認してください。');
        }
      }

      let prepared = expensePreflight;
      if (saveExpense && (!savedPurchaseRef.current || expenseReviewNeedsRefresh.current || !prepared?.ready)) {
        prepared = await prepareFeedPurchaseExpense({ paymentDate, paymentMethod,
          amount: displayedTotalPrice, vendor: form.supplier,
          description: `${form.feedName.trim()} 購入`, memo: form.memo, allowSeparatePayment,
        }, paymentOwner, { reviewed: expensePreflight || undefined, linkExpenseId: selectedExpenseId || undefined });
        setExpensePreflight(prepared);
        setExpenseReviewOnly(Boolean(selectedExpenseId) && expenseReviewOnly);
        expenseReviewNeedsRefresh.current = !prepared.ready;
        if (!prepared.ready) {
          setSelectedExpenseId(''); setAllowSeparatePayment(false);
          setError(prepared.message || '似た支払いの経費を確認してください。');
          return;
        }
      }
      if (submitData.transactionType === '出庫') {
        const individualTarget = allocationTarget === 'individual'
          ? individualOptions.find((item) => item.key === selectedIndividualKey)
          : undefined;
        if (allocationTarget === 'individual' && !individualTarget) {
          throw new Error('個体を選択してください。');
        }
        const costing = await buildFeedCostingSnapshot(submitData, allocationTarget, individualTarget);
        submitData.costing = costing;
        submitData.unitPrice = String(costing.averageUnitCost);
        submitData.totalPrice = String(costing.usedCost);
      }

      requireDocumentOwner();
      if (saveExpense) assertExpenseSyncContext(paymentOwner);
      let created = savedPurchaseRef.current;
      if (!created) {
        const expectedOwner = documentOwner || (saveExpense && paymentOwner.farmId
          ? { farmId: paymentOwner.farmId, userId: paymentOwner.userId || '' } : undefined);
        created = expectedOwner
          ? await createFeedInventory(submitData, expectedOwner)
          : await createFeedInventory(submitData);
        // Stock may already be saved even if the account changed during sync.
        // Keep its receipt before any check or await so retries never add stock.
        savedPurchaseRef.current = created;
        setSavedPurchaseRecord(created);
        expensePendingRef.current = saveExpense;
        setExpensePending(saveExpense);
        if (documentOwner && documentSelection) {
          const savedId = created.id;
          setSavedDocumentRecordId(savedId);
          setCompletedLines(previous => ({ ...previous, [documentSelection.lineIndex]: savedId }));
          setPossibleDuplicates([]); setDuplicateKey(''); setConfirmedDuplicateKey(null);
        }
      }
      requireDocumentOwner();
      if (saveExpense) {
        assertExpenseSyncContext(paymentOwner);
        if (!prepared?.ready) throw new Error('経費の入力内容を確認してください。');
        const review = await bindFeedPurchaseExpenseReview(prepared, created);
        if (prepared.linkExpenseId) await linkFeedPurchaseExpense(review, prepared.linkExpenseId);
        else await createFeedPurchaseExpense(review, prepared.input);
        assertExpenseSyncContext(paymentOwner);
        expensePendingRef.current = false;
        setExpensePending(false);
        setExpenseComplete(true);
      }
      if (documentOwner && documentSelection) return;
      navigate('/feed-inventory');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料在庫記録を登録できませんでした。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function refreshExpenseReview() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const prepared = await prepareFeedPurchaseExpense({ paymentDate, paymentMethod,
        amount: displayedTotalPrice, vendor: form.supplier,
        description: `${form.feedName.trim()} 購入`, memo: form.memo, allowSeparatePayment: false,
      }, paymentOwner, { reviewOnly: true });
      setExpensePreflight(prepared);
      setExpenseReviewOnly(true);
      setSelectedExpenseId(''); setAllowSeparatePayment(false);
      expenseReviewNeedsRefresh.current = !prepared.ready;
      if (prepared.message) setError(prepared.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録済みの経費を読み直せませんでした。');
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }

  function deferExpense() {
    if (savingRef.current) return;
    expensePendingRef.current = false;
    setExpensePending(false); setError('');
    if (!documentOwner) navigate('/feed-inventory');
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        {useMode ? '飼料を使用' : openedForDocument ? '納品書・請求書から入庫' : '飼料在庫 新規登録'}
      </Typography>

      <Alert severity="info">
        {useMode
          ? '使用先と数量を選んで記録します。単価と金額は在庫原価から自動計算します。'
          : openedForDocument ? '写真・PDFから読み取り、品目ごとに確認して入庫します。'
          : '飼料の入庫・出庫・調整を記録します。購入時の支払いも、この画面で経費に登録できます。'}
      </Alert>

      {error && <Alert severity="error" ref={documentErrorRef} tabIndex={-1}>{error}</Alert>}
      {expensePending && !saving && <Alert severity="warning">
        入庫は保存済みです。経費の保存結果を確認して再試行してください。入庫を重ねて登録することはありません。
      </Alert>}
      {savedDocumentRecordId && !expensePending && <Alert severity="success" ref={documentStatusRef} tabIndex={-1}>
        <Stack spacing={1}>
          <Typography>{form.feedName}（{form.quantity}{form.unit}）{expenseComplete
            ? 'の入庫と経費を登録しました。' : 'を入庫登録しました。'}次の品目を選ぶか、一覧へ戻ってください。</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button component={RouterLink} to={`/feed-inventory/${savedDocumentRecordId}/edit`} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>登録内容を確認</Button>
            {savedPurchaseRecord && <Button variant="outlined" onClick={() => setExpenseRecord(savedPurchaseRecord)} sx={{ minHeight: 44 }}>経費を確認・登録</Button>}
          </Stack>
        </Stack>
      </Alert>}
      {!useMode && form.transactionType === '入庫' && form.sourceType !== 'homegrown' && <FeedDocumentImport
        onApply={applyFeedDocument}
        initialSelection={documentSelection}
        completedLineIndexes={Object.keys(completedLines).map(Number)}
        autoOpen={openedForDocument}
        disabled={saving || expensePending}
        buttonLabel={savedDocumentRecordId ? '次の品目を選ぶ' : undefined}
      />}
      {possibleDuplicates.length > 0 && <Alert severity="warning"><Stack spacing={1}>
        <Typography>次の入庫が登録されています。</Typography>
        {possibleDuplicates.slice(0, 3).map(record => <Button component={RouterLink} key={record.id}
          to={`/feed-inventory/${record.id}/edit`} sx={{ minHeight: 44 }}>
          {record.transactionDate} ／ {record.feedName} ／ {record.quantity}{record.unit} を確認
        </Button>)}
        <FormControlLabel control={<Checkbox checked={confirmedDuplicateKey === duplicateKey}
          onChange={event => setConfirmedDuplicateKey(event.target.checked ? duplicateKey : null)} />}
          label="別の納品分であることを確認して登録します" />
      </Stack></Alert>}

      {(!savedDocumentRecordId || expensePending) && <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <fieldset disabled={stockFieldsDisabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="入出庫日"
                    type="date"
                    value={form.transactionDate}
                    onChange={(e) => updateField('transactionDate', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>

                {!useMode && (
                  <Grid item xs={12} md={4}>
                    <TextField
                      select
                      label="区分"
                      value={form.transactionType}
                      onChange={(e) => updateField('transactionType', e.target.value)}
                      fullWidth
                      disabled={stockFieldsDisabled || Boolean(documentOwner)}
                    >
                      {feedInventoryTransactionTypeOptions.map((item) => (
                        <MenuItem key={item} value={item}>{item}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="単位"
                    value={form.unit}
                    onChange={(e) => updateField('unit', e.target.value)}
                    fullWidth
                    disabled={stockFieldsDisabled || (useMode && Boolean(searchParams.get('unit')))}
                  >
                    {feedInventoryUnitOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                {form.transactionType === '出庫' && (
                  <Grid item xs={12} md={useMode ? 4 : 12}>
                    <TextField
                      select
                      label="使用先"
                      disabled={stockFieldsDisabled}
                      value={allocationTarget}
                      onChange={(e) => setAllocationTarget(e.target.value as FeedAllocationTargetType)}
                      fullWidth
                      helperText={allocationTarget === 'individual'
                        ? '選んだ1頭に、この出庫原価を100%紐付けます。'
                        : '群を選ぶと、その日の対象牛を自動取得して原価を按分します。'}
                    >
                      {allocationTargetOptions.map((item) => (
                        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}

                {form.transactionType === '出庫' && allocationTarget === 'individual' && (
                  <Grid item xs={12} md={useMode ? 4 : 12}>
                    <TextField
                      select
                      label="個体を選択"
                      disabled={stockFieldsDisabled}
                      value={selectedIndividualKey}
                      onChange={(e) => setSelectedIndividualKey(e.target.value)}
                      fullWidth
                      required
                      helperText={individualOptions.length > 0
                        ? '成牛・子牛から1頭選びます。'
                        : '選択できる個体がありません。'}
                    >
                      <MenuItem value="">選択してください</MenuItem>
                      {individualOptions.map((item) => (
                        <MenuItem key={item.key} value={item.key}>{item.label}</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}

                <Grid item xs={12} md={useMode ? 4 : 6}>
                  {savedPurchaseRecord ? <TextField label="飼料名" value={form.feedName} disabled fullWidth /> : <FeedSearchField
                    value={form.feedName}
                    onChange={(name) => updateField('feedName', name)}
                    required
                  />}
                </Grid>

                {!useMode && form.transactionType === '入庫' && (
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="入庫元"
                      value={form.sourceType || 'purchased'}
                      onChange={(e) => updateField('sourceType', e.target.value as FeedInventorySourceType)}
                      fullWidth
                      disabled={stockFieldsDisabled || Boolean(documentOwner)}
                      helperText={form.sourceType === 'homegrown'
                        ? '自家製牧草など。生産原価を在庫原価として登録します。'
                        : '購入した飼料として登録します。'}
                    >
                      <MenuItem value="purchased">購入</MenuItem>
                      <MenuItem value="homegrown">自家製</MenuItem>
                    </TextField>
                  </Grid>
                )}

                {!useMode && (!isHomegrownInbound || form.transactionType !== '入庫') && (
                  <Grid item xs={12} md={6}>
                    {savedPurchaseRecord ? <TextField label="仕入先" value={form.supplier} disabled fullWidth /> : <PartnerSearchField
                      label="仕入先"
                      value={form.supplier}
                      onChange={(name) => updateField('supplier', name)}
                    />}
                  </Grid>
                )}

                <Grid item xs={12} md={4}>
                  <TextField
                    label="数量"
                    placeholder="例：10"
                    value={form.quantity}
                    onChange={(e) => updateField('quantity', e.target.value)}
                    fullWidth
                    required
                    helperText={form.unit ? `単位：${form.unit}` : ''}
                  />
                </Grid>

                {form.unit === '袋' && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="1袋の重量（kg）"
                        placeholder="例：20"
                        value={form.bagWeightKg}
                        onChange={(e) => updateField('bagWeightKg', e.target.value)}
                        fullWidth
                        required
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="合計重量（kg）"
                        value={calculatedTotalWeightKg}
                        helperText="袋数 × 1袋の重量"
                        fullWidth
                        InputProps={{ readOnly: true }}
                      />
                    </Grid>
                  </>
                )}

                {!useMode && (
                  <>
                    <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                      <TextField
                        label={isHomegrownInbound
                          ? (form.unit === 'ロール' ? '1ロール生産原価' : '1単位生産原価')
                          : form.transactionType === '入庫' ? '単価（税込）' : '単価'}
                        placeholder="例：80"
                        value={form.unitPrice}
                        onChange={(e) => updateField('unitPrice', e.target.value)}
                        fullWidth
                        disabled={form.transactionType === '出庫'}
                        helperText={form.transactionType === '出庫' ? '在庫の移動平均原価から自動計算します' : ''}
                      />
                    </Grid>

                    <Grid item xs={12} md={form.unit === '袋' ? 6 : 4}>
                      <TextField
                        label={isHomegrownInbound ? '生産原価合計' : form.transactionType === '入庫' ? '金額（税込）' : '金額'}
                        placeholder="例：40000"
                        value={displayedTotalPrice}
                        onChange={(e) => updateField('totalPrice', e.target.value)}
                        fullWidth
                        disabled={form.transactionType === '出庫'}
                        helperText={form.transactionType === '出庫'
                          ? '出庫量 × 移動平均原価で自動計算します'
                          : calculatedTotalPrice
                            ? (isHomegrownInbound
                              ? '数量 × 生産原価で自動計算。必要な場合は修正できます'
                              : '数量 × 単価で自動計算。必要な場合は修正できます')
                            : (isHomegrownInbound ? '数量 × 生産原価' : '数量 × 単価')}
                      />
                    </Grid>

                    {form.transactionType === '入庫' && !isHomegrownInbound && (
                      <>
                        <Grid item xs={12} md={4}>
                          <TextField
                            select
                            label="消費税率"
                            disabled={stockFieldsDisabled}
                            value={documentOwner ? form.taxRate || '' : form.taxRate || '10'}
                            onChange={(e) => updateField('taxRate', (e.target.value || undefined) as FarmTaxRate | undefined)}
                            fullWidth
                            SelectProps={{ displayEmpty: Boolean(documentOwner) }}
                            InputLabelProps={documentOwner ? { shrink: true } : undefined}
                            helperText={documentOwner ? '書類の税率を確認してください' : '設定の基本消費税率を初期表示します'}
                          >
                            {documentOwner && <MenuItem value="">確認してください</MenuItem>}
                            {taxRateOptions.map((item) => (
                              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="税抜金額"
                            value={taxBreakdown.taxExcludedPrice}
                            fullWidth
                            InputProps={{ readOnly: true }}
                            helperText="在庫原価に使用します"
                          />
                        </Grid>
                        <Grid item xs={12} md={4}>
                          <TextField
                            label="消費税額"
                            value={taxBreakdown.taxAmount}
                            fullWidth
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                      </>
                    )}
                    {isHomegrownInbound && (
                      <Grid item xs={12}>
                        <Alert severity="info">
                          自家製飼料は消費税を計算しません。入力した生産原価をそのまま在庫原価に使います。
                        </Alert>
                      </Grid>
                    )}
                  </>
                )}

                <Grid item xs={12} md={useMode ? 4 : 12}>
                  <TextField
                    label="メモ"
                    placeholder="例：7月分仕入れ、母牛群へ出庫、棚卸し調整"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={useMode ? 2 : 3}
                  />
                </Grid>
              </Grid>
              </fieldset>

              {isPurchasedInbound && <FeedPurchasePaymentFields
                enabled={expenseEnabled}
                onEnabledChange={enabled => { setExpenseEnabled(enabled); resetExpenseReview(); }}
                paymentDate={paymentDate}
                onPaymentDateChange={value => { setPaymentDate(value); resetExpenseReview(); }}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={value => { setPaymentMethod(value); resetExpenseReview(); }}
                transactionDate={form.transactionDate}
                amount={displayedTotalPrice}
                supplier={form.supplier}
                disabled={saving}
                locked={Boolean(savedPurchaseRecord)}
                candidates={(expenseReviewOnly ? expensePreflight?.linkableExpenses : expensePreflight?.matchingExpenses) || []}
                candidateMode={expenseReviewOnly ? 'link-existing' : 'same-payment'}
                selectedExpenseId={selectedExpenseId}
                allowSeparatePayment={allowSeparatePayment}
                onExpenseChoiceChange={(expenseId, separate) => {
                  setSelectedExpenseId(expenseId); setAllowSeparatePayment(separate);
                  expenseReviewNeedsRefresh.current = true;
                }}
              />}
              {isPurchasedInbound && expenseEnabled && <Stack spacing={0.5}>
                <Button type="button" onClick={refreshExpenseReview} disabled={saving}
                  sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
                  {expensePending ? '登録済みの経費を読み直す' : '登録済みの経費を確認'}
                </Button>
                {expenseReviewOnly && !expensePreflight?.linkableExpenses.length &&
                  <Typography variant="body2" color="text.secondary">同じ金額・仕入先の、紐付けできる経費はありません。</Typography>}
              </Stack>}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}
                  sx={{ minHeight: 44 }}>
                  {saving ? '登録中...' : expensePending ? '経費の登録を再試行' : useMode ? '使用を記録'
                    : isPurchasedInbound && expenseEnabled ? '入庫と経費を登録'
                    : documentOwner ? '入庫を登録' : isPurchasedInbound ? '入庫のみ登録' : '登録'}
                </Button>
                <Button type="button" variant="outlined" onClick={expensePending ? deferExpense : () => navigate('/feed-inventory')}
                  disabled={saving} sx={{ minHeight: 44 }}>
                  {expensePending ? '経費はあとで確認' : '一覧へ戻る'}
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>}
      {savedDocumentRecordId && !expensePending && <Button variant="outlined" onClick={() => navigate('/feed-inventory')} sx={{ minHeight: 44 }}>一覧へ戻る</Button>}
      <FeedPurchaseExpenseDialog record={expenseRecord} onClose={() => setExpenseRecord(null)} />
    </Stack>
  );
}
