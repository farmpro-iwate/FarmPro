import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getSale, SaleRecord } from '../services/salesApi';
import { getExpensesList, retryPendingExpenseSync, ExpenseRecord } from '../services/expensesApi';
import { getSavedSettlement, saveManualSettlement, type SavedSettlement } from '../services/manualSettlementSave';
import { reviewSettlement, SettlementDeduction } from '../utils/manualSettlement';
import { checkCloudSettlementStatus, getCloudSettlementDetails, type CloudSettlementDetails, type CloudSettlementStatus } from '../services/cloudSettlementStatus';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { clearCloudSettlementAttempt, hasPendingCloudSettlement, submitCloudSettlement, CloudSettlementRejectedError } from '../services/cloudSettlementSave';
import { getStoredAuthUser } from '../services/authClient';
import { SaleStatementImport } from '../components/SaleStatementImport';
import { getSaleStatementTargetErrors, normalizeSaleStatementCandidate, validateSaleStatementCandidate, type SaleStatementCandidate } from '../utils/saleStatementImport';
import { readSaleStatementHandoff } from '../utils/saleStatementHandoff';

const asYen = (value: string) => value.trim() === '' ? NaN : Number(value);
type Entry = { label: string; amount: string; expenseId: string; category: string };
const emptyEntry = (): Entry => ({ label: '', amount: '', expenseId: '', category: '手数料' });
const draftKey = (farmId: string, saleId: string) => `farmpro:settlement-draft:${encodeURIComponent(farmId || 'local')}:${saleId}`;
const yenText = (value: number) => Number.isFinite(value) ? `${value.toLocaleString('ja-JP')}円` : '未確定';
export function ManualSettlementReview() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [cloudStatus, setCloudStatus] = useState<CloudSettlementStatus | null>(null);
  const [cloudDetails, setCloudDetails] = useState<CloudSettlementDetails | null>(null);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [farmId, setFarmId] = useState('');
  const savingRef = useRef(false);
  const cloudSaleId = sale ? (sale.syncRecordId || `sale:${sale.id}`) : '';
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const currentFarmId = getStoredAuthUser()?.farmId || '';
    setFarmId(currentFarmId);
    setSale(null);
    setExpenses([]);
    setPreviousSettlement(null);
    setCloudStatus(null);
    setCloudDetails(null);
    setDraftReady(false);
    setSaved(false);
    setDraftRestored(false);
    setRows([emptyEntry()]);
    setNumber(''); setNet(''); setAdjustment('0'); setPaymentDate(''); setVendor('');
    setSubmissionUncertain(false);
    setError('');
    Promise.all([getSale(id), getExpensesList({ requireCloudSync: isMultiDevicePlan }), getSavedSettlement(id)])
      .then(([s, e, previous]) => {
        if (cancelled || currentFarmId !== (getStoredAuthUser()?.farmId || '')) return;
        setSale(s); setExpenses(e); setPreviousSettlement(previous);
        if (isMultiDevicePlan) {
          // The cloud sale is keyed by syncRecordId, not the local IndexedDB ID.
          const cloudSaleId = s.syncRecordId || `sale:${s.id}`;
          setSubmissionUncertain(hasPendingCloudSettlement(currentFarmId, cloudSaleId));
          void checkCloudSettlementStatus(cloudSaleId)
            .then(async (status) => {
              if (cancelled || currentFarmId !== getStoredAuthUser()?.farmId) return;
              setCloudStatus(status);
              if (status.registered) {
                setSaved(true);
                setSubmissionUncertain(false);
                clearCloudSettlementAttempt(currentFarmId, cloudSaleId);
                const details = await getCloudSettlementDetails(cloudSaleId);
                if (!cancelled && currentFarmId === getStoredAuthUser()?.farmId) setCloudDetails(details);
              }
            })
            .catch(() => { if (!cancelled) setError('クラウドの精算状況を確認できません。通信を確認して再確認してください。'); });
        }
        if (!previous) {
          try {
            const raw = sessionStorage.getItem(draftKey(currentFarmId, s.id));
            let restoredDraft = false;
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
                restoredDraft = true;
              }
            }
            // A freshly registered sale can carry a validated, read-only
            // statement candidate. Pre-fill editable settlement inputs without
            // another import step. Never overwrite an existing local draft.
            if (!restoredDraft && !raw && s.status === '販売済み') {
              const incoming = readSaleStatementHandoff(location.state, getStoredAuthUser(), s);
              if (incoming) {
                const check = validateSaleStatementCandidate(incoming);
                const targetErrors = getSaleStatementTargetErrors(incoming, {
                  targetNumber: s.targetNumber, targetName: s.targetName,
                  salePrice: s.salePrice, saleDate: s.saleDate,
                });
                if (!check.errors.length && !targetErrors.length) {
                  const draftRows: Entry[] = incoming.deductions.map(row => ({
                    label: row.label, amount: row.amountYen, expenseId: '',
                    category: row.label.includes('手数料') ? '手数料' : 'その他',
                  }));
                  setRows(draftRows);
                  setNumber(incoming.statementNumber);
                  setNet(String(check.netYen));
                  setAdjustment(String(check.adjustmentYen));
                  setPaymentDate(incoming.paymentDate);
                  setVendor(incoming.issuerName || incoming.marketName);
                  setDraftRestored(true);
                } else {
                  setError('精算書の読み取り結果に不一致があります。保存せず、内容を確認してください。');
                }
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
      .catch(() => { if (!cancelled) setError('記録の読み込みに失敗しました。通信を確認して画面を開き直してください。'); });
    return () => { cancelled = true; };
  }, [id, isMultiDevicePlan]);
  useEffect(() => {
    if (!draftReady || !sale || previousSettlement || saved || farmId !== (getStoredAuthUser()?.farmId || '')) return;
    try {
      sessionStorage.setItem(draftKey(farmId, sale.id), JSON.stringify({
        saleNumber: sale.targetNumber, number, net, adjustment, paymentDate, vendor, rows,
      }));
    } catch (draftError) {
      console.warn('精算の一時入力を保持できませんでした。', draftError);
    }
  }, [draftReady, sale, previousSettlement, saved, number, net, adjustment, paymentDate, vendor, rows, farmId]);
  const linkedIds = rows.map((r) => r.expenseId).filter(Boolean);
  const rowKeys = rows.filter((r) => r.label.trim() && r.amount.trim())
    .map((r) => `${r.label.trim().toLocaleLowerCase()}|${r.amount.trim()}`);
  const hasDuplicateRows = new Set(rowKeys).size !== rowKeys.length;
  const hasEmptyRows = rows.some((r) => !r.label.trim() || !r.amount.trim());
  function canLinkExpense(expense: ExpenseRecord): boolean {
    const numbers = [expense.animalEarTag, expense.target].map(n => String(n || '').trim()).filter(Boolean);
    if (!sale?.targetNumber || numbers.length === 0 || numbers.some(n => n !== sale.targetNumber.trim())) return false;
    if (!isMultiDevicePlan) return true;
    const animalType = sale.targetType === '子牛' ? 'calf' : sale.targetType === '成牛' ? 'cattle' : undefined;
    const animalId = animalType === 'calf' ? sale.calfId : animalType === 'cattle' ? sale.cattleId : undefined;
    return !!animalType && expense.animalType === animalType &&
      (!expense.animalId || expense.animalId === animalId) && expense.category !== '飼料費' &&
      !expense.cloudSyncPending && !expense.settlementSaleId;
  }
  const hasUnverifiedExistingExpense = rows.some((row) => {
    if (!row.expenseId) return false;
    const expense = expenses.find((item) => item.id === row.expenseId);
    return !expense || !canLinkExpense(expense);
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
  function requireSameFarm() {
    if (!farmId || getStoredAuthUser()?.farmId !== farmId) {
      throw new Error('ログイン中の農場が変わりました。画面を開き直してください');
    }
  }
  const statementCandidate = useMemo(() => sale && farmId === (getStoredAuthUser()?.farmId || '')
    ? readSaleStatementHandoff(location.state, getStoredAuthUser(), sale) : null,
  [location.state, sale, farmId]);
  const hasSettlementInput = Boolean(number || net || paymentDate || vendor || adjustment !== '0' ||
    rows.some((row) => row.label || row.amount || row.expenseId));
  const statementImportRequested = new URLSearchParams(location.search).get('import') === 'statement';
  const statementImportDisabled = !draftReady || !sale || saving || submissionUncertain || saved ||
    Boolean(previousSettlement || cloudDetails) || sale.status !== '販売済み' ||
    (isMultiDevicePlan && (!cloudStatus?.saleReady || cloudStatus.registered));

  function applySaleStatement(value: SaleStatementCandidate) {
    if (statementImportDisabled || !sale) return;
    try {
      requireSameFarm();
      const candidate = normalizeSaleStatementCandidate(value);
      const check = validateSaleStatementCandidate(candidate);
      const errors = [...check.errors, ...getSaleStatementTargetErrors(candidate, {
        targetNumber: sale.targetNumber, targetName: sale.targetName,
        salePrice: sale.salePrice, saleDate: sale.saleDate,
      })];
      if (errors.length) { setError(errors.join(' / ')); return; }
      const nextRows: Entry[] = candidate.deductions.map((row) => ({
        label: row.label, amount: row.amountYen, expenseId: '',
        category: row.label.includes('手数料') ? '手数料' : 'その他',
      }));
      const nextVendor = candidate.issuerName || candidate.marketName;
      // Store only editable input. No sale, expense, or settlement is saved here.
      // Keep the existing draft intact if even this temporary write fails.
      sessionStorage.setItem(draftKey(farmId, sale.id), JSON.stringify({
        saleNumber: sale.targetNumber, number: candidate.statementNumber,
        net: String(check.netYen), adjustment: String(check.adjustmentYen),
        paymentDate: candidate.paymentDate, vendor: nextVendor, rows: nextRows,
      }));
      setNumber(candidate.statementNumber);
      setNet(String(check.netYen));
      setAdjustment(String(check.adjustmentYen));
      setPaymentDate(candidate.paymentDate);
      setVendor(nextVendor);
      setRows(nextRows);
      setDraftRestored(false);
      setError('');
      if (location.state && typeof location.state === 'object' &&
          Object.prototype.hasOwnProperty.call(location.state, 'farmproSaleStatement')) {
        const { farmproSaleStatement: _candidate, ...rest } = location.state as Record<string, unknown>;
        // Once explicitly applied, back/reload must not reapply the old candidate.
        try {
          navigate(`${location.pathname}${location.search}${location.hash}`, {
            replace: true, state: Object.keys(rest).length ? rest : null,
          });
        } catch {
          // The confirmed editable draft is already retained even if history is unavailable.
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '読み取り候補を反映できませんでした。入力内容を確認してください。');
    }
  }
  async function readRegisteredSettlement() {
    requireSameFarm();
    const committed = await getCloudSettlementDetails(cloudSaleId);
    requireSameFarm();
    if (!committed) throw new Error('登録済み精算の明細を確認できません');
    setCloudDetails(committed);
    setCloudStatus(previous => ({ saleId: cloudSaleId, registered: true,
      saleReady: previous?.saleReady ?? false, settlementNumber: committed.settlement.settlementNumber }));
    clearCloudSettlementAttempt(farmId, cloudSaleId);
    // Pull the existing server projection; never create a second local expense.
    setExpenses(await getExpensesList({ requireCloudSync: true }));
  }
  async function handleCloudSave() {
    if (!isMultiDevicePlan || !sale || savingRef.current || saved || submissionUncertain ||
        previousSettlement || cloudDetails || hasDuplicateRows || hasEmptyRows ||
        hasUnverifiedExistingExpense || !review.matchesStatement || !paymentDate || !vendor.trim() ||
        !cloudStatus?.saleReady || cloudStatus.registered || sale.status !== '販売済み') return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    let submitted = false;
    try {
      requireSameFarm();
      const status = await checkCloudSettlementStatus(cloudSaleId);
      setCloudStatus(status);
      if (status.registered) {
        setSaved(true);
        await readRegisteredSettlement();
        return;
      }
      if (!status.saleReady) throw new Error('販売記録の同期・状態を確認してください。精算は保存していません');
      const linkedCloudIds = new Map(rows.filter(row => row.expenseId).map(row => {
        const expense = expenses.find(item => item.id === row.expenseId);
        if (!expense || expense.cloudSyncPending) throw new Error('紐づける経費の同期が完了していません。経費管理で確認してください');
        return [row.expenseId, expense.syncRecordId || `expense:${expense.id}`];
      }));
      const fresh = rows.filter(row => !row.expenseId);
      const entries = fresh.map(row => ({
        id: `expense:${crypto.randomUUID()}`, paymentDate, category: row.category,
        description: row.label.trim(), vendor: vendor.trim(), amount: String(asYen(row.amount)), target: sale.targetNumber,
      }));
      const details = rows.map(row => `・${row.label}：${yenText(asYen(row.amount))}${row.expenseId ? '（登録済み経費）' : '（新規経費）'}`).join('\n');
      const summary = `対象牛：${sale.targetName || sale.targetNumber}（耳標${sale.targetNumber}）\n販売日：${sale.saleDate}\n精算番号：${number.trim()}\n精算日：${paymentDate}\n支払先：${vendor.trim()}\n販売金額：${yenText(asYen(sale.salePrice))}\n${details}\n控除合計：${yenText(totalDeductions)}\n調整額：${yenText(asYen(adjustment))}\n差引支払額：${yenText(asYen(net))}\n\n新規経費${entries.length}件と精算を正式保存します。内容は正しいですか？`;
      if (!window.confirm(summary)) return;
      submitted = true;
      await submitCloudSettlement({
        confirmed: true,
        expectedSale: {
          targetType: sale.targetType, targetNumber: sale.targetNumber, targetName: sale.targetName,
          birthday: sale.birthday || '', saleDate: sale.saleDate,
          calfId: sale.calfId || '', cattleId: sale.cattleId || '',
        },
        grossYen: asYen(sale.salePrice), adjustmentYen: asYen(adjustment),
        deductions: rows.map(row => ({ label: row.label.trim(), amountYen: asYen(row.amount),
          ...(row.expenseId ? { expenseId: linkedCloudIds.get(row.expenseId)! } : {}) })),
        bundle: {
          settlement: { saleId: cloudSaleId, settlementNumber: number.trim(), expectedNetYen: asYen(net),
            paymentDate, vendor: vendor.trim(),
            expenseIds: entries.map(row => row.id), linkedExpenseIds: rows.filter(row => row.expenseId).map(row => linkedCloudIds.get(row.expenseId)!),
            createdAt: new Date().toISOString() },
          expenses: entries,
        },
      }, farmId);
      // Server confirmed commit. Never permit a second registration merely
      // because the subsequent read-back fails or the network disconnects.
      setSaved(true);
      setSubmissionUncertain(false);
      try { sessionStorage.removeItem(draftKey(farmId, sale.id)); } catch { /* Save already committed. */ }
      try {
        await readRegisteredSettlement();
      } catch {
        setError('精算は正式保存済みです。明細・経費の再取得に失敗したため、通信回復後に登録状況を再確認してください');
      }
    } catch (cause) {
      if (submitted && getStoredAuthUser()?.farmId === farmId) {
        const uncertain = !(cause instanceof CloudSettlementRejectedError) && hasPendingCloudSettlement(farmId, cloudSaleId);
        setSubmissionUncertain(uncertain);
        // Re-query once. If this check also fails, stay locked rather than
        // risk sending a second settlement from the same screen.
        try {
          const latest = await checkCloudSettlementStatus(cloudSaleId);
          setCloudStatus(latest);
          if (latest.registered) {
            setSaved(true);
            setSubmissionUncertain(false);
            await readRegisteredSettlement();
            setError('');
          } else {
            setError(uncertain ? '登録結果の確認が必要です。「登録状況を再確認」を押してください。自動では再送信しません。'
              : cause instanceof Error ? cause.message : '保存していません。入力を確認してください');
          }
        } catch {
          setError('通信が切れたため登録結果は不明です。再送信せず、通信回復後に精算状況を確認してください');
        }
      } else {
        setError(cause instanceof Error ? cause.message : '精算登録状況を確認してください');
      }
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }
  async function recheckSettlement() {
    if (!sale || !isMultiDevicePlan || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      requireSameFarm();
      const status = await checkCloudSettlementStatus(cloudSaleId);
      setCloudStatus(status);
      if (!status.registered) {
        // A deliberate read completed after the server's farm request gate.
        // A new POST still requires another user confirmation; never auto retry.
        if (!saved) {
          clearCloudSettlementAttempt(farmId, cloudSaleId);
          setSubmissionUncertain(false);
        } else {
          setError('登録済みの応答と現在の記録が一致しません。再登録せず、確認を依頼してください。');
        }
        return;
      }
      setSaved(true);
      setSubmissionUncertain(false);
      try {
        await readRegisteredSettlement();
      } catch {
        setError('精算登録は確認できましたが、明細の再取得に失敗しました。');
      }
    } catch {
      setError('クラウド精算の確認に失敗しました。通信回復後に再確認してください。');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }
  async function handleSave() {
    if (!sale || previousSettlement || hasDuplicateRows || hasEmptyRows || hasUnverifiedExistingExpense || !review.matchesStatement || !paymentDate || !vendor.trim() || saving || saved) return;
    try { requireSameFarm(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'ログイン状態を確認してください'); return; }
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
      requireSameFarm();
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
      try { sessionStorage.removeItem(draftKey(farmId, sale.id)); } catch { /* local storage restrictions do not affect committed save */ }
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
  return <Stack spacing={2} sx={{ width: '100%', maxWidth: 1120, minWidth: 0, mx: 'auto', overflowWrap: 'anywhere' }}>
    <Stack spacing={0.5}>
      <Typography variant="h5" fontWeight={800}>販売精算</Typography>
      <Typography variant="body2" color="text.secondary">伝票の控除と差引支払額を入力し、内容を確認して保存してください。</Typography>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {saved && <Alert severity="success">販売精算は登録済みです。</Alert>}
    {draftRestored && !previousSettlement && !saved && <Alert severity="info">前回の入力を復元しました。内容を確認してください。</Alert>}
    {isMultiDevicePlan && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
      <Alert severity={submissionUncertain || !cloudStatus?.saleReady ? 'warning' : 'info'} sx={{ flex: 1, minWidth: 0 }}>
        {submissionUncertain ? '前回の保存結果を確認中です。登録状況を再確認してください。' : cloudStatus?.registered
          ? 'この販売は精算登録済みです。' : cloudStatus?.saleReady
            ? '保存前の照合が完了しました。明細を入力して確認してください。'
            : cloudStatus ? '販売記録がクラウドに未登録・未販売、または金額が不正です。販売記録を確認してください。' : 'クラウドの精算状況を確認中です。'}
      </Alert>
      {sale && <Button variant="outlined" disabled={saving} onClick={recheckSettlement} sx={{ flexShrink: 0, minHeight: 44 }}>登録状況を再確認</Button>}
    </Stack>}
    {isMultiDevicePlan && cloudDetails && (
      <Card variant="outlined"><CardContent>
        <Stack spacing={1}>
          <Typography fontWeight={800}>登録済み精算</Typography>
          <Typography>精算番号：{cloudDetails.settlement.settlementNumber}</Typography>
          {cloudDetails.settlement.paymentDate && <Typography>精算日：{cloudDetails.settlement.paymentDate}</Typography>}
          {cloudDetails.settlement.vendor && <Typography>支払先：{cloudDetails.settlement.vendor}</Typography>}
          {cloudDetails.settlement.grossYen !== undefined && <Typography>販売金額：{yenText(cloudDetails.settlement.grossYen)}</Typography>}
          {cloudDetails.settlement.deductions?.map((deduction, i) => <Typography key={i}>
            {deduction.label}：{yenText(deduction.amountYen)}{deduction.expenseId ? '（登録済み経費）' : ''}
          </Typography>)}
          {cloudDetails.settlement.adjustmentYen !== undefined && <Typography>調整額：{yenText(cloudDetails.settlement.adjustmentYen)}</Typography>}
          <Typography>差引精算額：{yenText(cloudDetails.settlement.expectedNetYen)}</Typography>
          {!cloudDetails.settlement.deductions && cloudDetails.expenses.map((expense) => (
            <Typography key={expense.id}>{expense.description} ／ {expense.category} ／ {yenText(Number(expense.amount))}</Typography>
          ))}
          <Typography>新規経費：{cloudDetails.expenses.length}件 ／ 登録済み経費：{cloudDetails.settlement.linkedExpenseIds?.length ?? 0}件</Typography>
        </Stack>
      </CardContent></Card>
    )}
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
    {!previousSettlement && !saved && !cloudDetails && <Card><CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}><fieldset disabled={saving || submissionUncertain} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
        <Typography fontWeight={800}>{sale?.targetName || '読み込み中'}（{sale?.targetNumber || '-'}）</Typography>
        <Typography>販売金額：{sale?.salePrice ? yenText(asYen(sale.salePrice)) : '-'}（登録済み記録）</Typography>
      </Stack>
      <SaleStatementImport
        target={{ targetNumber: sale?.targetNumber || '', targetName: sale?.targetName,
          salePrice: sale?.salePrice, saleDate: sale?.saleDate }}
        disabled={statementImportDisabled}
        initialCandidate={statementCandidate || undefined}
        autoOpen={(Boolean(statementCandidate) && !draftRestored) ||
          (statementImportRequested && !(draftRestored && hasSettlementInput))}
        applyLabel={hasSettlementInput ? '入力中の精算を置き換える' : '精算の入力欄に反映'}
        onApply={applySaleStatement}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="精算番号" fullWidth value={number} onChange={(e) => setNumber(e.target.value)} />
        <TextField label="差引精算額（円）" fullWidth value={net} onChange={(e) => setNet(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      </Box>
      <Stack spacing={0.5}>
        <Typography fontWeight={800}>控除明細（{rows.length}件）</Typography>
        <Typography variant="body2" color="text.secondary">登録済みの経費は「登録済み経費と紐づけ」で選択してください。</Typography>
      </Stack>
      {rows.map((row, i) => <Card key={i} variant="outlined" sx={{ bgcolor: !row.label.trim() || !row.amount.trim() ? 'action.hover' : 'background.paper' }}><CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}><Stack spacing={1.5}>
        <Typography fontWeight={700}>控除 {i + 1}：{row.label || '未入力'} {row.amount.trim() ? `／ ${row.amount}円` : ''}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
          <TextField label="控除名" size="small" fullWidth sx={{ flex: { md: 3 }, minWidth: 0 }} value={row.label} onChange={(e) => updateRow(i, { label: e.target.value })} error={!row.label.trim()} />
          <TextField label="控除額（税込円）" size="small" fullWidth sx={{ flex: { md: 1.5 }, minWidth: 0 }} value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })} inputProps={{ inputMode: 'numeric' }} error={!row.amount.trim()} />
          {!row.expenseId && <TextField label="新規経費の科目" size="small" select fullWidth sx={{ flex: { md: 2 }, minWidth: 0 }} value={row.category} onChange={(e) => updateRow(i, { category: e.target.value })}>
            {['手数料', '医薬品費', 'その他', '診療費', '種付け・繁殖費'].map((category) => <MenuItem value={category} key={category}>{category}</MenuItem>)}
          </TextField>}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField label="登録済み経費と紐づけ（任意）" select size="small" fullWidth sx={{ minWidth: 0 }} value={row.expenseId} onChange={(e) => {
            const selected = expenses.find((x) => x.id === e.target.value);
            updateRow(i, selected ? { expenseId: selected.id, label: selected.description, amount: selected.amount } : { expenseId: '' });
          }}>
            <MenuItem value="">新規経費候補（まだ保存しない）</MenuItem>
            {expenses.filter((e) => e.id === row.expenseId || (!linkedIds.includes(e.id) && canLinkExpense(e))).map((e) =>
              <MenuItem key={e.id} value={e.id}>{e.description} / {e.amount}円 / 経費日：{e.paymentDate || '未登録'} / 対象：{e.animalEarTag || e.target || '未登録'}</MenuItem>)}
          </TextField>
          <Button color="error" variant="outlined" disabled={rows.length === 1} onClick={() => setRows((old) => old.filter((_, index) => index !== i))} sx={{ flexShrink: 0, alignSelf: { xs: 'flex-end', sm: 'center' }, minHeight: 40 }}>この明細を除く</Button>
        </Stack>
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
      </Stack></CardContent></Card>)}
      {hasEmptyRows && <Alert severity="warning">未入力の控除があります。入力するか「この明細を除く」で整理してください。</Alert>}
      {hasDuplicateRows && <Alert severity="warning">同じ控除名・金額が複数あります。重複でないか確認してください。重複したまま保存はできません。</Alert>}
      {hasUnverifiedExistingExpense && <Alert severity="error">選択した経費の個体情報・同期状況・精算への使用状況を確認してください。確認が済むまで保存できません。</Alert>}
      <Button variant="outlined" disabled={hasEmptyRows || rows.length >= 100} onClick={() => setRows((old) => [...old, emptyEntry()])} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minHeight: 44 }}>＋ 控除を1件追加</Button>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="精算日" fullWidth type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="支払先" fullWidth value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <TextField label="調整額（加算は＋、減算は－）" fullWidth value={adjustment} onChange={(e) => setAdjustment(e.target.value)} inputProps={{ inputMode: 'numeric' }} />
      </Box>
      <Card variant="outlined"><CardContent><Stack spacing={1}>
        <Typography fontWeight={800}>精算金額の確認</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
          <Typography>販売金額：{yenText(asYen(sale?.salePrice || ''))}</Typography>
          <Typography>控除合計（{rows.length}件）：－{yenText(totalDeductions)}</Typography>
          <Typography>調整額：{yenText(asYen(adjustment))}（プラスは加算）</Typography>
          <Typography>伝票の差引精算額：{yenText(asYen(net))}</Typography>
        </Box>
        <Typography variant="h6" fontWeight={800}>計算上の差引：{review.errors.some((e) => e.startsWith('控除明細')) ? '未確定' : yenText(review.calculatedNetYen)}</Typography>
        <Typography fontWeight={700} color={review.matchesStatement && !hasDuplicateRows ? 'success.main' : 'text.secondary'}>{review.matchesStatement && !hasDuplicateRows ? '✓ 金額一致' : '明細・入力金額を確認してください'}</Typography>
      </Stack></CardContent></Card>
      <Typography>登録済み経費：{review.linkedExistingExpenses.length}件 ／ 新規経費候補：{review.newExpenses.length}件</Typography>
      {review.matchesStatement ? <Alert severity="success">入力された金額は一致しています。ただし、伝票原本・個体・重複の最終確認は未実施です。</Alert> :
        review.errors.map((message, i) => <Alert severity="warning" key={i}>{message}</Alert>)}
      <Button variant="contained" disabled={!review.matchesStatement || hasDuplicateRows || hasEmptyRows ||
        hasUnverifiedExistingExpense || !paymentDate || !vendor.trim() || saving || submissionUncertain ||
        !sale || sale.status !== '販売済み' || (isMultiDevicePlan && (!cloudStatus?.saleReady || cloudStatus.registered))}
        onClick={isMultiDevicePlan ? handleCloudSave : handleSave} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-end' }, minWidth: { sm: 260 }, minHeight: 44 }}>
        {saving ? '保存中...' : '内容を確認して正式保存'}
      </Button>
    </Stack></fieldset></CardContent></Card>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button component={RouterLink} to="/sales" variant="outlined">出荷・販売一覧へ</Button>
      {(saved || previousSettlement) && <Button component={RouterLink} to="/expenses" variant="outlined">経費を確認する</Button>}
      <Button component={RouterLink} to={sale ? `/sales/${sale.id}/edit` : '/sales'} variant="outlined">販売編集へ戻る</Button>
    </Stack>
  </Stack>;
}
