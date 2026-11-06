import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Treatment, TreatmentInput } from '../types/treatment';
import { getSupplyBatches, getSupplyMovements, type SupplyBatch } from '../services/supplyInventoryApi';
import { createTreatment, getTreatment, getTreatmentList, updateTreatment } from '../services/treatmentApi';
import { deleteExpenseBySource, upsertExpenseBySource } from '../services/expensesApi';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';
import { getSchedule, updateSchedule } from '../services/scheduleApi';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { isTreatmentRecovered, treatmentCourseKey } from '../utils/treatmentRecovery';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';
import { MedicineSearchField, MedicineOption } from '../components/MedicineSearchField';
import { StaffSearchField } from '../components/StaffSearchField';
import { DiseaseSearchField } from '../components/DiseaseSearchField';
import { TreatmentProcedureSearchField } from '../components/TreatmentProcedureSearchField';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { useAiRecordFormDraft } from '../ai/useAiRecordFormDraft';
import { getAiRecordFormValues } from '../ai/recordFormDraft';
import { AiRecordDraftNotice } from '../components/AiRecordDraftNotice';
import { TreatmentMedicineStockFields } from '../components/TreatmentMedicineStockFields';
import { getSupplyInventorySyncStatus } from '../services/supplyInventorySync';

type Props = { mode: 'create' | 'edit' };

function treatmentFormContext() {
  const user = getStoredAuthUser();
  return { farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), planId: getCurrentFarmProPlanId() };
}
type SaveAttempt = { context: ReturnType<typeof treatmentFormContext>; localId: number | null };

const recordTypeOptions = [
  { value: '治療', label: '一般治療' },
  { value: '繁殖治療', label: '繁殖治療' },
  { value: '予防', label: '予防' },
  { value: '去勢', label: '去勢' },
  { value: '削蹄', label: '削蹄' },
  { value: 'その他の処置', label: 'その他の処置' }
] as const;

const breedingTreatmentTypeOptions = [
  '発情誘起処置',
  '排卵誘起処置',
  '発情・排卵同期化',
  '黄体関連処置',
  'その他の繁殖処置'
] as const;

const hoofAbnormalityOptions = ['未記録', '異常なし', '異常あり'] as const;

const initialForm: TreatmentInput = {
  recordType: '治療',
  breedingTreatmentType: '',
  targetNumber: '',
  targetName: '',
  symptom: '',
  diagnosis: '',
  diseaseMasterId: undefined,
  treatmentProcedure: '',
  treatmentProcedureMasterId: undefined,
  treatmentDate: '',
  medicine: '',
  dosage: '',
  medicineCost: '',
  medicalFee: '',
  withdrawalEndDate: '',
  veterinarian: '',
  progress: '治療中',
  note: ''
};

function addCalendarDays(dateText: string, days: number) {
  if (!dateText || !Number.isFinite(days)) return '';
  const [year, month, day] = dateText.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function TreatmentForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialTargetNumber = mode === 'create' ? searchParams.get('targetNumber') ?? '' : '';
  const initialTargetName = mode === 'create' ? searchParams.get('targetName') ?? '' : '';
  const initialRecordType = mode === 'create' ? searchParams.get('recordType') ?? '' : '';
  const initialBreedingTreatmentType = mode === 'create' ? searchParams.get('breedingTreatmentType') ?? '' : '';
  const initialTreatmentDate = mode === 'create' ? searchParams.get('treatmentDate') ?? '' : '';
  const initialSymptom = mode === 'create' ? searchParams.get('symptom') ?? '' : '';
  const sourceScheduleId = mode === 'create' ? searchParams.get('sourceScheduleId') ?? '' : '';
  const sourceTreatmentId = mode === 'create' ? searchParams.get('sourceTreatmentId') ?? '' : '';
  const entry = mode === 'create' ? searchParams.get('entry') ?? '' : '';
  const returnTo = searchParams.get('returnTo') ?? '';
  const hasLinkedInput = Array.from(searchParams.keys()).some(key => key !== 'returnTo');
  const aiDraft = useAiRecordFormDraft('treatment', mode === 'create' && !hasLinkedInput);
  const [aiInitialValues] = useState(() => getAiRecordFormValues<TreatmentInput>(aiDraft.draft));
  const [targetKind, setTargetKind] = useState<'cattle' | 'calf' | ''>(() =>
    aiDraft.draft?.fields.targetType === '子牛' ? 'calf' : aiDraft.draft?.fields.targetType === '成牛' ? 'cattle' : '');
  const openedFromAnimal = mode === 'create' && Boolean(initialTargetNumber);
  const openedFromSynchronizationSchedule = Boolean(sourceScheduleId);
  const openedFromBreedingCheck = entry === 'breeding-check';
  const [form, setForm] = useState<TreatmentInput>(() => ({
    ...initialForm,
    recordType: initialRecordType || initialForm.recordType,
    breedingTreatmentType: (initialBreedingTreatmentType || '') as TreatmentInput['breedingTreatmentType'],
    targetNumber: initialTargetNumber,
    targetName: initialTargetName,
    treatmentDate: initialTreatmentDate,
    symptom: initialSymptom,
    progress: initialRecordType === '繁殖治療' ? '繁殖継続' : initialForm.progress,
    ...(aiDraft.draft ? aiInitialValues : {}),
  }));
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineOption | null>(null);
  const [continuationSource, setContinuationSource] = useState<Treatment | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const progressEditedRef = useRef(false);
  const saveAttempt = useRef<SaveAttempt>({ context: treatmentFormContext(), localId: null });
  const [saveError, setSaveError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [medicineBatches, setMedicineBatches] = useState<SupplyBatch[]>([]);
  const [medicineStockReload, setMedicineStockReload] = useState(0);
  const [medicineStockLoading, setMedicineStockLoading] = useState(true);
  const [medicineStockError, setMedicineStockError] = useState('');
  const [medicineStockSyncWarning, setMedicineStockSyncWarning] = useState('');
  const [medicineStockNotice, setMedicineStockNotice] = useState('');

  useEffect(() => {
    const attempt: SaveAttempt = { context: treatmentFormContext(), localId: null };
    saveAttempt.current = attempt;
    setMedicineStockNotice('');
    const invalidateAttempt = () => {
      if (saveAttempt.current === attempt) saveAttempt.current = { ...attempt, localId: null };
    };
    if (mode === 'create') {
      progressEditedRef.current = false;
      setForm({
        ...initialForm,
        recordType: initialRecordType || initialForm.recordType,
        breedingTreatmentType: (initialBreedingTreatmentType || '') as TreatmentInput['breedingTreatmentType'],
        targetNumber: initialTargetNumber,
        targetName: initialTargetName,
        treatmentDate: initialTreatmentDate,
        symptom: initialSymptom,
        progress: initialRecordType === '繁殖治療' ? '繁殖継続' : initialForm.progress,
        ...(aiDraft.draft ? aiInitialValues : {}),
      });
      setSelectedMedicine(null);
      setDetailsOpen(false);
      return invalidateAttempt;
    }

    if (mode === 'edit' && id) {
      getTreatment(id).then((data) => {
        setForm({
          recordType: data.recordType || '治療',
          breedingTreatmentType: data.breedingTreatmentType || '',
          targetNumber: data.targetNumber,
          targetName: data.targetName,
          symptom: data.symptom,
          diagnosis: data.diagnosis,
          diseaseMasterId: data.diseaseMasterId,
          treatmentProcedure: data.treatmentProcedure || '',
          treatmentProcedureMasterId: data.treatmentProcedureMasterId,
          hoofAbnormality: data.hoofAbnormality || '未記録',
          nextScheduledDate: data.nextScheduledDate || '',
          treatmentDate: data.treatmentDate,
          medicine: data.medicine,
          dosage: data.dosage,
          medicineCost: data.medicineCost || '',
          medicalFee: data.medicalFee || '',
          withdrawalEndDate: data.withdrawalEndDate,
          veterinarian: data.veterinarian,
          progress: data.progress,
          note: data.note,
          medicineSource: data.medicineSource || '',
          medicineInventoryBatchKey: data.medicineInventoryBatchKey,
          medicineInventoryQuantity: data.medicineInventoryQuantity
        });
      }).finally(() => setLoading(false));
    }
    return invalidateAttempt;
  }, [mode, id, initialTargetNumber, initialTargetName, initialRecordType, initialBreedingTreatmentType, initialTreatmentDate, initialSymptom, sourceScheduleId, sourceTreatmentId]);

  useEffect(() => {
    let active = true;
    const attempt = saveAttempt.current;
    setMedicineStockLoading(true);
    setMedicineStockError('');
    setMedicineStockSyncWarning('');
    const load = async () => {
      try {
        assertSaveAttempt(attempt);
        const rows = await getSupplyMovements();
        if (!active) return;
        assertSaveAttempt(attempt);
        setMedicineBatches(getSupplyBatches(rows, '医薬品'));
        const status = getSupplyInventorySyncStatus();
        setMedicineStockSyncWarning(status.state === 'pending' || status.state === 'conflict' ? status.message : '');
      } catch {
        if (!active) return;
        try {
          assertSaveAttempt(attempt);
          setMedicineStockError('在庫を読み込めませんでした。「在庫を再読み込み」を押してください。');
        } catch {
          setMedicineBatches([]);
          setMedicineStockError('ログイン中の農場または利用者が変わりました。画面を開き直してください。');
        }
      } finally {
        if (active) setMedicineStockLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [medicineStockReload, mode, id, initialTargetNumber, initialTargetName, initialRecordType, initialBreedingTreatmentType, initialTreatmentDate, initialSymptom, sourceScheduleId, sourceTreatmentId]);

  useEffect(() => {
    if (form.medicineSource !== 'farm_stock') return;
    const refresh = () => { if (!savingRef.current) setMedicineStockReload(value => value + 1); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [form.medicineSource]);

  const setValue = (key: keyof TreatmentInput, value: string) => {
    if (key === 'progress') progressEditedRef.current = true;
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'progress' && value === '回復' ? { nextScheduledDate: '' } : {}),
    }));
  };

  useEffect(() => {
    if (mode !== 'create' || aiDraft.draft) {
      // An explicit AI candidate (e.g. hoof trimming) is a new record, not an
      // inferred continuation of an unrelated treatment for the same number.
      setContinuationSource(null);
      return;
    }

    const targetNumber = String(form.targetNumber || '').trim();
    const targetName = String(form.targetName || '').trim();
    if (!targetNumber && !targetName) {
      setContinuationSource(null);
      return;
    }

    let cancelled = false;
    getTreatmentList()
      .then((rows) => {
        if (cancelled) return;
        const active = (rows as Treatment[])
          .filter((row) => ['治療中', '要再診', '経過観察'].includes(String(row.progress || '')) && !isTreatmentRecovered(row, rows))
          .sort((a, b) => String(b.treatmentDate || '').localeCompare(String(a.treatmentDate || '')));

        const exactNumber = targetNumber
          ? active.find((row) => String(row.targetNumber || '').trim() === targetNumber)
          : undefined;

        const useSourceTreatment = Boolean(sourceTreatmentId)
          && targetNumber === initialTargetNumber.trim()
          && targetName === initialTargetName.trim();
        let matched = useSourceTreatment
          ? active.find((row) => String(row.id) === sourceTreatmentId)
          : exactNumber;
        if (!useSourceTreatment && !matched && targetName) {
          const sameName = active.filter((row) => String(row.targetName || '').trim() === targetName);
          const distinctNumbers = new Set(
            sameName.map((row) => String(row.targetNumber || '').trim()).filter(Boolean),
          );
          if (sameName.length > 0 && distinctNumbers.size <= 1) matched = sameName[0];
        }

        setContinuationSource(matched || null);
        if (!matched) return;

        setForm((prev) => ({
          ...prev,
          recordType: matched.recordType || prev.recordType || '治療',
          breedingTreatmentType: matched.breedingTreatmentType || prev.breedingTreatmentType || '',
          symptom: prev.symptom || matched.symptom || '',
          diagnosis: prev.diagnosis || matched.diagnosis || '',
          diseaseMasterId: prev.diseaseMasterId || matched.diseaseMasterId,
          treatmentProcedure: prev.treatmentProcedure || matched.treatmentProcedure || '',
          treatmentProcedureMasterId: prev.treatmentProcedureMasterId || matched.treatmentProcedureMasterId,
          veterinarian: prev.veterinarian || matched.veterinarian || '',
        }));
      })
      .catch(() => setContinuationSource(null));

    return () => {
      cancelled = true;
    };
  }, [mode, form.targetNumber, form.targetName, sourceTreatmentId, initialTargetNumber, initialTargetName]);

  const applyMedicineWithdrawal = (medicine: MedicineOption | null, treatmentDate: string) => {
    if (!medicine || medicine.autoCalculateWithdrawal === false || medicine.meatWithdrawalDays === undefined || !treatmentDate) return '';
    return addCalendarDays(treatmentDate, medicine.meatWithdrawalDays);
  };

  const handleMedicineChange = (name: string, medicine?: MedicineOption | null) => {
    const selected = medicine || null;
    setSelectedMedicine(selected);
    setMedicineStockNotice('');
    setForm((prev) => {
      const automaticDate = applyMedicineWithdrawal(selected, prev.treatmentDate);
      return {
        ...prev,
        medicine: name,
        ...(name.trim() !== prev.medicine.trim() ? {
          medicineInventoryBatchKey: undefined, medicineInventoryQuantity: undefined,
        } : {}),
        withdrawalEndDate: automaticDate || (name ? prev.withdrawalEndDate : '')
      };
    });
  };

  const handleMedicineStockSelection = (batch: SupplyBatch | null) => {
    if (savingRef.current || medicineStockLoading || medicineStockError) return;
    try { assertSaveAttempt(saveAttempt.current); }
    catch {
      setMedicineStockError('ログイン中の農場または利用者が変わりました。画面を開き直してください。');
      return;
    }
    if (!batch) {
      setForm(prev => ({ ...prev, medicineInventoryBatchKey: undefined, medicineInventoryQuantity: undefined }));
      return;
    }
    const current = medicineBatches.find(item => item.key === batch.key);
    if (!current || (current.balance <= 0 && current.key !== form.medicineInventoryBatchKey)) {
      setMedicineStockError('選択した在庫を確認できません。在庫を再読み込みしてください。');
      return;
    }
    if (current.itemName.trim() !== form.medicine.trim()) {
      setSelectedMedicine(null);
      setMedicineStockNotice('在庫に登録された薬品名へ変更しました。投薬量・休薬終了日を確認してください。');
    }
    setForm(prev => ({
      ...prev, medicine: current.itemName.trim(), medicineSource: 'farm_stock',
      medicineInventoryBatchKey: current.key,
      medicineInventoryQuantity: current.key === prev.medicineInventoryBatchKey ? prev.medicineInventoryQuantity : undefined,
    }));
  };

  const handleTreatmentDateChange = (date: string) => {
    setForm((prev) => {
      const automaticDate = applyMedicineWithdrawal(selectedMedicine, date);
      return {
        ...prev,
        treatmentDate: date,
        withdrawalEndDate: automaticDate || prev.withdrawalEndDate
      };
    });
  };

  const validateForm = () => {
    if (aiDraft.draft && !targetKind) {
      alert('対象区分を選択するか、台帳から対象を選択してください。');
      return false;
    }
    if (!form.targetNumber || !form.targetName || !form.treatmentDate) {
      alert(`耳標番号、名号、${openedFromBreedingCheck ? '検診日' : '治療日'}は必須です`);
      return false;
    }

    if (!continuationSource && ['治療', '繁殖治療'].includes(form.recordType || '治療') && !form.symptom.trim()) {
      alert(openedFromBreedingCheck ? '繁殖検診では所見を入力してください' : `${form.recordType || '治療'}記録では症状を入力してください`);
      return false;
    }

    if (!continuationSource && form.recordType === '繁殖治療' && !form.breedingTreatmentType && !openedFromBreedingCheck) {
      alert('繁殖処置区分を選択してください');
      return false;
    }

    for (const [label, rawValue] of [['医薬品費', form.medicineCost], ['診療費', form.medicalFee]] as const) {
      if (!rawValue?.trim()) continue;
      const amount = Number(rawValue);
      if (!Number.isFinite(amount) || amount < 0) {
        alert(`${label}は0以上の数字で入力してください`);
        return false;
      }
    }

    return true;
  };

  const assertSaveAttempt = (attempt: SaveAttempt) => {
    const current = treatmentFormContext();
    const expected = attempt.context;
    if (saveAttempt.current !== attempt || current.farmId !== expected.farmId || current.userId !== expected.userId ||
        current.token !== expected.token || current.planId !== expected.planId) {
      throw new Error('ログイン・農場または画面の情報が変わったため、治療記録の保存を中止しました。画面を開き直して内容を確認してください。');
    }
  };

  const saveTreatment = async (attempt: SaveAttempt): Promise<Treatment | undefined> => {
    assertSaveAttempt(attempt);
    if (mode === 'create') {
      const input = {
      ...form,
      // A new prevention record has no treatment course to track by default.
      // Keep explicit input, AI candidates and existing/continued records intact.
      progress: form.recordType === '予防' && form.progress === initialForm.progress
        && !continuationSource && !progressEditedRef.current && !aiInitialValues.progress
        ? '' : form.progress,
      nextScheduledDate: form.progress === '回復' ? '' : form.nextScheduledDate,
      treatmentCourseId: continuationSource ? treatmentCourseKey(continuationSource) : undefined,
      };
      // A failed cloud/expense step must reuse the source already stored on this
      // device. Keeping only the ID avoids replaying stale form content.
      const saved = attempt.localId !== null
        ? await updateTreatment(attempt.localId, input)
        : await createTreatment(input, { onLocalSaved: localId => {
          attempt.localId = localId;
          assertSaveAttempt(attempt);
        } });
      attempt.localId = saved.id;
      assertSaveAttempt(attempt);
      return saved;
    }
    if (id) return updateTreatment(id, form);
    return undefined;
  };

  const resolveExpenseAnimal = async () => {
    const targetNumber = form.targetNumber.trim();
    const [cattleList, calfList] = await Promise.all([
      getCattleList().catch(() => []),
      getCalfList().catch(() => []),
    ]);

    const cattle = targetKind !== 'calf'
      ? cattleList.find((item) => item.earTag.trim() === targetNumber) : undefined;
    if (cattle) {
      return {
        animalType: 'cattle' as const,
        animalId: String(cattle.id),
        animalEarTag: cattle.earTag,
        animalName: cattle.name,
      };
    }

    const calf = targetKind !== 'cattle' ? calfList.find((item) => {
      const displayedNumber = formatTemporaryCalfNumber(item.calfNumber, item.birthday);
      return item.calfNumber.trim() === targetNumber
        || item.temporaryCalfNumber?.trim() === targetNumber
        || displayedNumber.trim() === targetNumber;
    }) : undefined;
    if (calf) {
      return {
        animalType: 'calf' as const,
        animalId: String(calf.id),
        animalEarTag: calf.calfNumber,
        animalName: calf.name,
      };
    }

    return {};
  };

  const syncTreatmentExpenses = async (treatment: Treatment, assertCurrent: () => void) => {
    assertCurrent();
    const sourceId = String(treatment.id);
    const animal = await resolveExpenseAnimal();
    assertCurrent();
    const common = {
      paymentDate: form.treatmentDate,
      expenseCategoryMasterId: undefined,
      vendor: form.veterinarian || '',
      vendorMasterId: undefined,
      paymentMethod: '',
      target: `${form.targetNumber} ${form.targetName}`.trim(),
      ...animal,
      sourceType: 'treatment' as const,
      sourceId,
      memo: `治療記録から自動作成（治療記録ID: ${sourceId}）`,
    };

    const medicineCost = Number(form.medicineCost || 0);
    if (medicineCost > 0) {
      await upsertExpenseBySource({
        ...common,
        category: '医薬品費',
        description: form.medicine ? `治療薬品：${form.medicine}` : '治療薬品費',
        amount: String(medicineCost),
      });
    } else {
      await deleteExpenseBySource('treatment', sourceId, '医薬品費');
    }
    assertCurrent();

    const medicalFee = Number(form.medicalFee || 0);
    if (medicalFee > 0) {
      await upsertExpenseBySource({
        ...common,
        category: '診療費',
        description: form.diagnosis ? `診療：${form.diagnosis}` : '診療費',
        amount: String(medicalFee),
      });
    } else {
      await deleteExpenseBySource('treatment', sourceId, '診療費');
    }
    assertCurrent();
  };

  const completeSourceSchedule = async (assertCurrent: () => void) => {
    assertCurrent();
    if (!sourceScheduleId) return;
    const schedule = await getSchedule(sourceScheduleId);
    assertCurrent();
    await updateSchedule(sourceScheduleId, {
      scheduleType: schedule.scheduleType,
      title: schedule.title,
      targetNumber: schedule.targetNumber,
      targetName: schedule.targetName,
      dueDate: schedule.dueDate,
      status: '完了',
      note: schedule.note,
      synchronizationProgramId: schedule.synchronizationProgramId,
      synchronizationProgramName: schedule.synchronizationProgramName,
      synchronizationPurpose: schedule.synchronizationPurpose,
      synchronizationStartDate: schedule.synchronizationStartDate,
      synchronizationStep: schedule.synchronizationStep,
    });
    assertCurrent();
  };

  const continueToSynchronization = openedFromBreedingCheck && String(form.breedingTreatmentType || '').includes('同期化');

  const handleSubmit = async () => {
    if (savingRef.current) return;
    setSaveError('');
    if (!validateForm()) return;
    if (form.medicine.trim() && !form.medicineSource && !(mode === 'edit' && id)) {
      alert('薬剤の使用元を選んでください。'); return;
    }
    if (form.medicineSource === 'farm_stock' && Number(form.medicineCost || 0) > 0) {
      alert('農場在庫から使用した医薬品は購入時に経費登録します。医薬品費を0円にして二重計上を防いでください。'); return;
    }
    if (form.medicineSource === 'farm_stock' && (!form.medicineInventoryBatchKey || !form.medicineInventoryQuantity || form.medicineInventoryQuantity <= 0)) {
      alert('使用する在庫と数量を選んでください。'); return;
    }

    savingRef.current = true;
    setSaving(true);
    const attempt = saveAttempt.current;
    const assertCurrent = () => assertSaveAttempt(attempt);
    try {
      aiDraft.assertCurrent();
      const savedTreatment = await saveTreatment(attempt);
      assertCurrent();
      if (savedTreatment) await syncTreatmentExpenses(savedTreatment, assertCurrent);
      await completeSourceSchedule(assertCurrent);

      if (continueToSynchronization) {
        const query = new URLSearchParams({
          targetNumber: form.targetNumber,
          targetName: form.targetName,
          returnTo: returnTo || '/treatments'
        }).toString();
        navigate(`/schedules/synchronization/new?${query}`);
        return;
      }

      const shouldGoToSales = form.recordType === '繁殖治療' && form.progress === '繁殖終了';
      if (shouldGoToSales) {
        const query = new URLSearchParams({
          targetNumber: form.targetNumber,
          targetName: form.targetName,
          returnTo: returnTo || '/treatments'
        }).toString();
        navigate(`/sales/new?${query}`);
        return;
      }

      navigate(returnTo || '/treatments');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '治療記録の保存を確認できませんでした。入力内容と通信状態を確認してください。');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const recordType = form.recordType || '治療';
  const isBreedingTreatment = recordType === '繁殖治療';
  const isBreedingFinished = isBreedingTreatment && form.progress === '繁殖終了';
  const isPrevention = recordType === '予防';
  const needsDisease = recordType === '治療' || recordType === '繁殖治療';
  const isCastration = recordType === '去勢';
  const isHoof = recordType === '削蹄';
  const showWithdrawalFields = Boolean(form.medicine?.trim());
  const withdrawal = judgeWithdrawal(form.withdrawalEndDate);
  const automaticWithdrawalAvailable = Boolean(selectedMedicine && selectedMedicine.autoCalculateWithdrawal !== false && selectedMedicine.meatWithdrawalDays !== undefined);
  const synchronizationCompact = openedFromSynchronizationSchedule && isBreedingTreatment;
  const pageTitle = synchronizationCompact
    ? '同期化処置を実施'
    : openedFromBreedingCheck
      ? '繁殖検診・処置'
      : mode === 'create'
        ? continuationSource
          ? '継続治療を記録'
          : '治療記録を新規登録'
        : '治療記録を編集';

  const medicineStockFields = (
    <>
      {Boolean(form.medicine.trim()) && (
        <Stack spacing={1}>
          <TreatmentMedicineStockFields
            medicine={form.medicine} source={form.medicineSource || ''} batches={medicineBatches}
            selectedKey={form.medicineInventoryBatchKey} quantity={form.medicineInventoryQuantity}
            loading={medicineStockLoading} error={medicineStockError} syncWarning={medicineStockSyncWarning}
            disabled={saving}
            onSourceChange={source => {
              setForm(prev => ({ ...prev, medicineSource: source, medicineInventoryBatchKey: undefined, medicineInventoryQuantity: undefined }));
              if (source === 'farm_stock') setMedicineStockReload(value => value + 1);
            }}
            onReload={() => setMedicineStockReload(value => value + 1)}
            onSelectBatch={handleMedicineStockSelection}
            onQuantityChange={quantity => setForm(prev => ({ ...prev, medicineInventoryQuantity: quantity }))}
          />
          {medicineStockNotice && <Alert severity="info">{medicineStockNotice}</Alert>}
        </Stack>
      )}
    </>
  );

  const continuationFields = continuationSource ? (
    <Stack spacing={1.5}>
      <Alert severity="info">
        前回の治療を引き継いで記録します。
        {continuationSource.treatmentDate ? ` 前回：${continuationSource.treatmentDate}` : ''}
        {continuationSource.symptom ? ` / 症状：${continuationSource.symptom}` : ''}
      </Alert>

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={isPrevention ? 12 : 6}>
          <TextField
            label="治療日"
            type="date"
            value={form.treatmentDate}
            onChange={(e) => handleTreatmentDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />
        </Grid>
        {!isPrevention && <Grid item xs={12} sm={6}>
          <TextField label="経過" select value={form.progress} onChange={(e) => setValue('progress', e.target.value)} fullWidth>
            <MenuItem value="治療中">治療中</MenuItem>
            <MenuItem value="経過観察">経過観察</MenuItem>
            <MenuItem value="回復">回復</MenuItem>
            <MenuItem value="要再診">要再診</MenuItem>
          </TextField>
        </Grid>}
      </Grid>

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={6}><MedicineSearchField value={form.medicine} onChange={handleMedicineChange} /></Grid>
        <Grid item xs={12} sm={6}><TextField label="投薬量" value={form.dosage} onChange={(e) => setValue('dosage', e.target.value)} fullWidth /></Grid>
      </Grid>
      {medicineStockFields}

      {form.progress === '回復' && (
        <Alert severity="success">保存すると治療を終了します。次回治療予定は表示されなくなり、治療履歴と残っている休薬期間は保持します。</Alert>
      )}
      <TextField
        label="次回予定日（任意）"
        type="date"
        value={form.nextScheduledDate || ''}
        onChange={(e) => setValue('nextScheduledDate', e.target.value)}
        InputLabelProps={{ shrink: true }}
        disabled={form.progress === '回復'}
        fullWidth
      />

      {showWithdrawalFields && (
        <Stack spacing={1}>
          {selectedMedicine && (
            <Alert severity={automaticWithdrawalAvailable ? 'info' : 'warning'}>
              {automaticWithdrawalAvailable
                ? `薬品マスターの肉・出荷 ${selectedMedicine.meatWithdrawalDays}日を基に休薬終了日の目安を自動入力しました。`
                : 'この薬品には肉・出荷の制限期間が登録されていません。必要なら休薬終了日を入力してください。'}
            </Alert>
          )}
          <TextField
            label="休薬期間終了日"
            type="date"
            value={form.withdrawalEndDate}
            onChange={(e) => setValue('withdrawalEndDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>
      )}

      <TextField label="メモ" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={2} fullWidth />

      <Button variant="outlined" onClick={() => setDetailsOpen((open) => !open)} fullWidth>
        {detailsOpen ? '前回情報・費用を閉じる' : '前回情報・費用を確認・修正'}
      </Button>

      {detailsOpen && (
        <Stack spacing={1.5}>
          {!isPrevention && <TextField
            label="症状"
            value={form.symptom}
            onChange={(e) => setValue('symptom', e.target.value)}
            fullWidth
          />}
          <Grid container spacing={1.25}>
            {!isPrevention && <Grid item xs={12} sm={6}>
              <DiseaseSearchField
                label="疾病名（診断名）"
                value={form.diagnosis}
                masterId={form.diseaseMasterId}
                onChange={(value, masterId) => { setValue('diagnosis', value); setForm((prev) => ({ ...prev, diseaseMasterId: masterId })); }}
              />
            </Grid>}
            <Grid item xs={12} sm={isPrevention ? 12 : 6}>
              <TreatmentProcedureSearchField
                value={form.treatmentProcedure || ''}
                masterId={form.treatmentProcedureMasterId}
                onChange={(value, masterId) => setForm((prev) => ({ ...prev, treatmentProcedure: value, treatmentProcedureMasterId: masterId }))}
              />
            </Grid>
          </Grid>
          <Grid container spacing={1.25}>
            <Grid item xs={12} sm={4}><TextField label="医薬品費（円）" type="number" value={form.medicineCost || ''} onChange={(e) => setValue('medicineCost', e.target.value)} inputProps={{ min: 0, step: 1 }} fullWidth /></Grid>
            <Grid item xs={12} sm={4}><TextField label="診療費（円）" type="number" value={form.medicalFee || ''} onChange={(e) => setValue('medicalFee', e.target.value)} inputProps={{ min: 0, step: 1 }} fullWidth /></Grid>
            <Grid item xs={12} sm={4}><StaffSearchField label="獣医師名" value={form.veterinarian} onChange={(value) => setValue('veterinarian', value)} /></Grid>
          </Grid>
        </Stack>
      )}
    </Stack>
  ) : null;

  const detailFields = (
    <Stack spacing={1.5}>
      <Grid container spacing={1.25}>
        {!isPrevention && <Grid item xs={12} sm={6}>
          <DiseaseSearchField
            label={isBreedingTreatment ? '繁殖診断名' : isCastration || isHoof ? '疾病名（任意）' : '疾病名（診断名）'}
            value={form.diagnosis}
            masterId={form.diseaseMasterId}
            onChange={(value, masterId) => { setValue('diagnosis', value); setForm((prev) => ({ ...prev, diseaseMasterId: masterId })); }}
            required={synchronizationCompact || openedFromBreedingCheck ? false : needsDisease}
          />
        </Grid>}
        <Grid item xs={12} sm={isPrevention ? 12 : 6}>
          <TreatmentProcedureSearchField value={form.treatmentProcedure || ''} masterId={form.treatmentProcedureMasterId} onChange={(value, masterId) => setForm((prev) => ({ ...prev, treatmentProcedure: value, treatmentProcedureMasterId: masterId }))} required={isCastration || isHoof} />
        </Grid>
      </Grid>

      {isHoof && (
        <TextField label="異常の有無" select value={form.hoofAbnormality || '未記録'} onChange={(e) => setValue('hoofAbnormality', e.target.value)} fullWidth>
          {hoofAbnormalityOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
      )}

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={6}><MedicineSearchField value={form.medicine} onChange={handleMedicineChange} /></Grid>
        <Grid item xs={12} sm={6}><TextField label="投薬量" value={form.dosage} onChange={(e) => setValue('dosage', e.target.value)} fullWidth /></Grid>
      </Grid>
      {medicineStockFields}

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={6}>
          <TextField
            label="医薬品費（円）"
            type="number"
            value={form.medicineCost || ''}
            onChange={(e) => setValue('medicineCost', e.target.value)}
            inputProps={{ min: 0, step: 1 }}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="診療費（円）"
            type="number"
            value={form.medicalFee || ''}
            onChange={(e) => setValue('medicalFee', e.target.value)}
            inputProps={{ min: 0, step: 1 }}
            fullWidth
          />
        </Grid>
      </Grid>

      {showWithdrawalFields ? (
        <Stack spacing={1}>
          {selectedMedicine && (
            <Alert severity={automaticWithdrawalAvailable ? 'info' : 'warning'}>
              {automaticWithdrawalAvailable
                ? `薬品マスターの肉・出荷 ${selectedMedicine.meatWithdrawalDays}日を基に休薬終了日の目安を自動入力しました。製品表示・獣医師の指示を優先し、必要なら日付を修正してください。`
                : 'この薬品には肉・出荷の制限期間が登録されていません。製品表示・獣医師の指示を確認して休薬終了日を入力してください。'}
              {selectedMedicine.milkWithdrawalHours !== undefined ? ` 乳の制限期間：${selectedMedicine.milkWithdrawalHours}時間。` : ''}
              {selectedMedicine.withdrawalNote ? ` ${selectedMedicine.withdrawalNote}` : ''}
            </Alert>
          )}
          <Grid container spacing={1.25} alignItems="center">
            <Grid item xs={12} sm={6}><TextField label="休薬期間終了日" type="date" value={form.withdrawalEndDate} onChange={(e) => setValue('withdrawalEndDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
            <Grid item xs={12} sm={6}><Typography color="text.secondary">休薬判定：{withdrawal}{form.withdrawalEndDate ? ` / あと${daysUntil(form.withdrawalEndDate)}日` : ''}</Typography></Grid>
          </Grid>
        </Stack>
      ) : (
        <Typography color="text.secondary">薬剤を使用した場合のみ、休薬情報を入力してください。</Typography>
      )}

      <Grid container spacing={1.25}>
        <Grid item xs={12} sm={isPrevention ? 6 : 4}><StaffSearchField label="獣医師名" value={form.veterinarian} onChange={(value) => setValue('veterinarian', value)} /></Grid>
        {!isPrevention && <Grid item xs={12} sm={4}>
          <TextField label="経過" select value={form.progress} onChange={(e) => setValue('progress', e.target.value)} fullWidth>
            <MenuItem value="治療中">治療中</MenuItem>
            <MenuItem value="経過観察">経過観察</MenuItem>
            {isBreedingTreatment ? (
              [
                <MenuItem key="繁殖継続" value="繁殖継続">繁殖継続</MenuItem>,
                <MenuItem key="繁殖終了" value="繁殖終了">繁殖終了</MenuItem>,
                <MenuItem key="要再診" value="要再診">要再診</MenuItem>
              ]
            ) : (
              [
                <MenuItem key="回復" value="回復">回復</MenuItem>,
                <MenuItem key="要再診" value="要再診">要再診</MenuItem>
              ]
            )}
          </TextField>
        </Grid>}
        <Grid item xs={12} sm={isPrevention ? 6 : 4}>
          <TextField
            label={isBreedingTreatment ? '次回予定日（再診・発情確認・授精）' : '次回予定日（任意）'}
            type="date"
            value={form.nextScheduledDate || ''}
            onChange={(e) => setValue('nextScheduledDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Grid>
      </Grid>

      <TextField label="メモ" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={2} fullWidth />
    </Stack>
  );

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>{pageTitle}</Typography>
      <AiRecordDraftNotice draft={aiDraft.draft} />
      {saveError && <Alert severity="error">{saveError}</Alert>}
      {mode === 'create' && !openedFromSynchronizationSchedule && !openedFromBreedingCheck && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/schedules/synchronization/new" variant="contained">同期化を開始</Button>
          <Button component={RouterLink} to="/schedules/synchronization/progress" variant="outlined">同期化進捗</Button>
        </Stack>
      )}
      {openedFromSynchronizationSchedule && (
        <Alert severity="info">同期化プログラムの予定から開いています。保存すると、この予定を完了にします。</Alert>
      )}
      {openedFromBreedingCheck && (
        <Alert severity="info">繁殖検診の所見を記録し、必要な場合だけ治療・処置を選びます。</Alert>
      )}
      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack spacing={1.5}>
            {openedFromAnimal ? (
              <Card variant="outlined">
                <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象個体</Typography></Grid>
                    <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.targetName}</Typography></Grid>
                    <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.targetNumber}</Typography></Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Grid container spacing={1.25}>
                {aiDraft.draft && <Grid item xs={12}>
                  <TextField label="対象区分" select value={targetKind}
                    onChange={(event) => setTargetKind(event.target.value as typeof targetKind)} fullWidth>
                    <MenuItem value="">台帳から選択して確認</MenuItem>
                    <MenuItem value="cattle">成牛</MenuItem>
                    <MenuItem value="calf">子牛</MenuItem>
                  </TextField>
                </Grid>}
                <Grid item xs={12} sm={6}>
                  <CattlePicker label="登録済み繁殖牛から選択" onSelect={(cattle) => {
                    setTargetKind('cattle');
                    setForm((prev) => ({ ...prev, targetNumber: cattle.earTag, targetName: cattle.name }));
                  }} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <CalfPicker label="登録済み子牛から選択" onSelect={(calf) => {
                    setTargetKind('calf');
                    setForm((prev) => ({ ...prev, targetNumber: calf.calfNumber, targetName: calf.name }));
                  }} />
                </Grid>
                <Grid item xs={12} sm={6}><TextField label="耳標番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} required fullWidth /></Grid>
                <Grid item xs={12} sm={6}><TextField label="名号" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} required fullWidth /></Grid>
              </Grid>
            )}

            {synchronizationCompact ? (
              <>
                <Alert severity="info">予定：{form.symptom || '同期化処置'}</Alert>
                <TextField label="実施日" type="date" value={form.treatmentDate} onChange={(e) => handleTreatmentDateChange(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
              </>
            ) : openedFromBreedingCheck ? (
              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={8}>
                  <TextField
                    label="検診所見"
                    value={form.symptom}
                    onChange={(e) => setValue('symptom', e.target.value)}
                    required
                    placeholder="例：無発情、発情微弱、卵巣所見、長期不受胎"
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={4}><TextField label="検診日" type="date" value={form.treatmentDate} onChange={(e) => handleTreatmentDateChange(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth /></Grid>
              </Grid>
            ) : continuationSource ? null : (
              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={isPrevention ? 6 : 4}>
                  <TextField label="治療区分" select value={recordType} onChange={(e) => setValue('recordType', e.target.value)} fullWidth>
                    {recordTypeOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                  </TextField>
                </Grid>
                {!isPrevention && <Grid item xs={12} sm={5}>
                  <TextField
                    label={needsDisease ? '症状' : '症状（任意）'}
                    value={form.symptom}
                    onChange={(e) => setValue('symptom', e.target.value)}
                    required={needsDisease}
                    placeholder={isBreedingTreatment ? '例：無発情、発情微弱、再発情、長期不受胎' : undefined}
                    fullWidth
                  />
                </Grid>}
                <Grid item xs={12} sm={isPrevention ? 6 : 3}><TextField label="治療日" type="date" value={form.treatmentDate} onChange={(e) => handleTreatmentDateChange(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth /></Grid>
              </Grid>
            )}

            {isBreedingTreatment && (
              <>
                {!synchronizationCompact && !openedFromBreedingCheck && (
                  <Alert severity="info">
                    繁殖に関する診断・処置を記録し、次回予定には再診、発情確認、授精予定などの日付を入力します。
                  </Alert>
                )}
                <TextField
                  label={openedFromBreedingCheck ? '治療・処置（必要な場合）' : '繁殖処置区分'}
                  select
                  value={form.breedingTreatmentType || ''}
                  onChange={(e) => setValue('breedingTreatmentType', e.target.value)}
                  required={!openedFromBreedingCheck}
                  fullWidth
                >
                  <MenuItem value="">{openedFromBreedingCheck ? '処置なし' : '選択してください'}</MenuItem>
                  {breedingTreatmentTypeOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </>
            )}

            {continuationSource ? continuationFields : synchronizationCompact || openedFromBreedingCheck ? (
              <>
                <Button variant="outlined" onClick={() => setDetailsOpen((open) => !open)} fullWidth>
                  {detailsOpen ? '詳細を閉じる' : '詳細を入力'}
                </Button>
                {detailsOpen && detailFields}
              </>
            ) : detailFields}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving} fullWidth>
                {saving
                  ? '保存中...'
                  : isBreedingFinished
                    ? '保存して次へ'
                    : synchronizationCompact
                      ? '実施を保存'
                      : continueToSynchronization
                        ? '検診を保存して同期化へ'
                        : openedFromBreedingCheck
                          ? '検診を保存'
                          : '保存'}
              </Button>
              <Button component={RouterLink} to={returnTo || '/treatments'} variant="outlined" size="large" fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
