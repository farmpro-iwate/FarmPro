import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { BirthdayField } from '../components/BirthdayField';
import { CalfInput, type Calf } from '../types/calf';
import { createCalf, getCalf, updateCalf } from '../services/calfApi';
import { getCattleList } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import type { Cattle } from '../types/cattle';
import type { Breeding } from '../types/breeding';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { calculateAgeDays, calculateAgeMonthsAndDays, calculateDg, judgeDg } from '../utils/calf';
import { useAiRecordFormDraft } from '../ai/useAiRecordFormDraft';
import { getAiRecordFormValues } from '../ai/recordFormDraft';
import { AiRecordDraftNotice } from '../components/AiRecordDraftNotice';
import { CalfCertificateImport } from '../components/CalfCertificateImport';
import { buildCalfCertificatePatch, normalizeCalfCertificateCandidate, normalizeCalfCertificateIdentifier, validateCalfCertificateForm,
  type CalfCertificateCandidate } from '../utils/calfCertificateImport';
import { findCalfCertificateDuplicates, type CalfCertificateDuplicate } from '../utils/calfCertificateEntry';
import { getStoredAuthUser } from '../services/authClient';
import { getAllRecords } from '../storage/repository';
import type { StoredRecord } from '../storage/types';

type Props = { mode: 'create' | 'edit' };
type CertificateOwner = { farmId: string; userId: string };

function certificateOwner(): CertificateOwner | null {
  const user = getStoredAuthUser();
  return user?.farmId ? { farmId: user.farmId, userId: user.id || '' } : null;
}

const initialForm: CalfInput = {
  calfNumber: '', identificationNumber: '', name: '', birthday: '', sex: '雌',
  motherName: '', motherCowId: '', motherCowName: '', breedingMethod: '', breedingId: '',
  recipientCowId: '', recipientCowName: '', geneticMotherCowId: '', geneticMotherCowName: '', sireName: '',
  startWeight: 0, currentWeight: 0, elapsedDays: 0, milkAmount: 0, starterAmount: 0,
  feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
  weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '',
  managementStatus: '育成中', note: ''
};

export function CalfForm({ mode }: Props) {
  const { id } = useParams();
  // A different calf or a new form must not inherit another calf's draft or saved ID.
  return <CalfFormContent key={`${mode}:${id || 'new'}`} mode={mode} id={id} />;
}

function CalfFormContent({ mode, id }: Props & { id?: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openedForCertificate = searchParams.get('source') === 'calf-certificate';
  const [formOwner] = useState(certificateOwner);
  const certificateOwnerRef = useRef<CertificateOwner | null>(null);
  const [certificateApplied, setCertificateApplied] = useState(false);
  const [certificateDuplicates, setCertificateDuplicates] = useState<CalfCertificateDuplicate[]>([]);
  const certificateSavedRef = useRef(false);
  const savingRef = useRef(false);
  const certificateRouteRef = useRef(0);
  const certificateErrorRef = useRef<HTMLDivElement | null>(null);
  const certificateNoticeRef = useRef<HTMLDivElement | null>(null);
  const originalCertificateIdentity = useRef<{ identificationNumber: string; calfNumber: string; label: string } | null>(null);
  const aiDraft = useAiRecordFormDraft('calf', mode === 'create');
  const [form, setForm] = useState<CalfInput>(() => ({
    ...initialForm, ...getAiRecordFormValues<CalfInput>(aiDraft.draft),
  }));
  const [temporaryEarTag, setTemporaryEarTag] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [syncWarning, setSyncWarning] = useState('');
  const [savedLocalId, setSavedLocalId] = useState<string>();
  const [editLoadFailed, setEditLoadFailed] = useState(false);
  const [cattleOptions, setCattleOptions] = useState<Cattle[]>([]);
  const [breedingOptions, setBreedingOptions] = useState<Breeding[]>([]);
  const [linkedCowId, setLinkedCowId] = useState('');

  function assertCertificateOwner(expected = certificateOwnerRef.current) {
    if (!expected) return;
    const current = certificateOwner();
    if (!current || current.farmId !== expected.farmId || current.userId !== expected.userId) {
      throw new Error('ログイン中の農場または利用者が変わりました。画面を開き直してください。');
    }
  }

  function assertCertificateIdentity(input: Pick<CalfInput, 'identificationNumber' | 'calfNumber'>) {
    const original = originalCertificateIdentity.current;
    if (mode !== 'edit' || !original) return;
    if (/^\d{10}$/.test(original.identificationNumber) &&
        normalizeCalfCertificateIdentifier(input.identificationNumber) !== original.identificationNumber) {
      throw new Error('登録済みの子牛と個体識別番号が異なります。対象の子牛を選び直してください。');
    }
    if (original.calfNumber && !original.calfNumber.startsWith('TEMP-') &&
        normalizeCalfCertificateIdentifier(input.calfNumber) !== normalizeCalfCertificateIdentifier(original.calfNumber)) {
      throw new Error('登録済みの子牛と耳標番号が異なります。対象の子牛を確認してください。');
    }
  }

  function applyCertificate(value: CalfCertificateCandidate) {
    if (savingRef.current || certificateSavedRef.current) throw new Error('保存中または保存済みです。画面を開き直してください。');
    const owner = certificateOwner();
    if (!owner || !formOwner || owner.farmId !== formOwner.farmId || owner.userId !== formOwner.userId) {
      throw new Error('ログイン中の農場を確認して、画面を開き直してください。');
    }
    assertCertificateOwner();
    aiDraft.assertCurrent();
    const candidate = normalizeCalfCertificateCandidate(value);
    const checked = buildCalfCertificatePatch(candidate, form);
    if (checked.errors.length || !checked.patch) throw new Error(checked.errors.join(' / ') || '証明書の内容を確認してください。');
    const next = { ...form, ...checked.patch };
    assertCertificateIdentity(next);
    certificateOwnerRef.current = owner;
    setCertificateApplied(true);
    setCertificateDuplicates([]);
    setForm(next);
    if (candidate.earTag) setTemporaryEarTag(false);
    setErrorMessage('');
    setSuccessMessage('登録証明書の内容を入力欄に反映しました。確認して保存してください。');
  }

  useEffect(() => {
    certificateRouteRef.current += 1;
    savingRef.current = false;
    setSaving(false);
    certificateOwnerRef.current = null;
    certificateSavedRef.current = false;
    originalCertificateIdentity.current = null;
    setCertificateApplied(false);
    setCertificateDuplicates([]);
    return () => { certificateRouteRef.current += 1; };
  }, [mode, id]);

  useEffect(() => {
    if (!certificateApplied || !errorMessage) return;
    certificateErrorRef.current?.focus({ preventScroll: true });
    certificateErrorRef.current?.scrollIntoView?.({ block: 'start' });
  }, [certificateApplied, errorMessage]);

  useEffect(() => {
    if (!certificateApplied || !successMessage) return;
    certificateNoticeRef.current?.focus({ preventScroll: true });
    certificateNoticeRef.current?.scrollIntoView?.({ block: 'start' });
  }, [certificateApplied, successMessage]);

  useEffect(() => {
    if (mode !== 'create') return;
    Promise.all([
      getCattleList().catch(() => []),
      getBreedingList().catch(() => []),
    ]).then(([cattle, breedings]) => {
      setCattleOptions((cattle as Cattle[]).filter((item) => item.sex === '雌'));
      setBreedingOptions(breedings as Breeding[]);
    });
  }, [mode]);

  useEffect(() => {
    if (mode !== 'edit') return;
    let cancelled = false;
    setLoading(true);
    setEditLoadFailed(false);
    if (!id) {
      setErrorMessage('指定された子牛が見つかりません。');
      setEditLoadFailed(true);
      setLoading(false);
      return;
    }

    getCalf(id).then((d) => {
      if (cancelled) return;
      if (getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync && d.cloudSyncPending) {
        setSyncWarning('この端末に保存済みですが、クラウド同期を保留しています。');
      }
      const calvingId = String(d.calvingId || '');
      const existingNumber = String(d.calfNumber || '').trim();
      const existingName = String(d.name ?? '');
      originalCertificateIdentity.current = {
        identificationNumber: normalizeCalfCertificateIdentifier(String(d.identificationNumber || '')), calfNumber: existingNumber,
        label: [existingNumber && !existingNumber.startsWith('TEMP-') ? `耳標 ${existingNumber}` : '耳標未装着',
          existingName && existingName !== '耳標未装着' ? existingName : '名号未登録', d.birthday ? `${d.birthday}生` : ''].filter(Boolean).join(' ／ '),
      };
      // A historical temporary number must not replace an assigned ear tag.
      const isTemporary = Boolean(
        existingNumber.startsWith('TEMP-') ||
        (!existingNumber && (d.temporaryCalfNumber || calvingId))
      );
      const internalCalfNumber = isTemporary
        ? (existingNumber.startsWith('TEMP-') ? existingNumber : String(d.temporaryCalfNumber || `TEMP-${calvingId}`))
        : existingNumber;

      setTemporaryEarTag(isTemporary);
      setForm({
        calfNumber: internalCalfNumber,
        identificationNumber: d.identificationNumber || '',
        name: existingName.trim() === '耳標未装着' ? '' : existingName,
        birthday: d.birthday,
        sex: d.sex,
        motherName: d.motherName,
        motherCowId: d.motherCowId || '',
        motherCowName: d.motherCowName || d.motherName || '',
        breedingMethod: d.breedingMethod || (d.recipientCowName || d.recipientCowId ? '受精卵移植' : ''),
        breedingId: d.breedingId || '',
        recipientCowId: d.recipientCowId || '',
        recipientCowName: d.recipientCowName || '',
        geneticMotherCowId: d.geneticMotherCowId || d.motherCowId || '',
        geneticMotherCowName: d.geneticMotherCowName || d.motherName || '',
        sireName: d.sireName || '',
        startWeight: d.startWeight,
        currentWeight: d.currentWeight,
        elapsedDays: d.elapsedDays,
        milkAmount: d.milkAmount,
        starterAmount: d.starterAmount,
        feedingMethod: d.feedingMethod || '人工哺育',
        weaningPlannedDate: d.weaningPlannedDate || '',
        weaningDate: d.weaningDate || '',
        weaningStatus: d.weaningStatus || (d.weaningDate ? '離乳済み' : '離乳前'),
        weaningWeight: d.weaningWeight || 0,
        weaningStarterAmount: d.weaningStarterAmount || 0,
        milkEndDate: d.milkEndDate || '',
        managementStatus: d.managementStatus || '育成中',
        note: d.note,
      });
    })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : '読み込みに失敗しました。');
        setEditLoadFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, id]);

  const setValue = (key: keyof CalfInput, value: string | number) => {
    setCertificateDuplicates([]);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const linkedCow = cattleOptions.find((item) => String(item.id) === linkedCowId);

  function breedingsForCow(cow: Cattle | undefined, method: string) {
    if (!cow) return [];
    return breedingOptions
      .filter((record) => {
        const sameCow =
          String(record.cowEarTag || '').trim() === String(cow.earTag || '').trim() ||
          String(record.cowName || '').trim() === String(cow.name || '').trim();
        if (!sameCow) return false;
        if (method === '受精卵移植') return record.breedingMethod === '受精卵移植';
        if (method === '人工授精') return record.breedingMethod !== '受精卵移植';
        return false;
      })
      .sort((a, b) => {
        const aDate = a.transferDate || a.inseminationDate || a.heatDate || '';
        const bDate = b.transferDate || b.inseminationDate || b.heatDate || '';
        return bDate.localeCompare(aDate);
      });
  }

  const linkedBreedings = breedingsForCow(linkedCow, form.breedingMethod || '');

  function selectLinkedCow(value: string) {
    setLinkedCowId(value);
    if (value === '__manual__') {
      setForm((prev) => ({
        ...prev,
        breedingId: '',
        recipientCowId: '',
        recipientCowName: '',
        geneticMotherCowId: '',
        geneticMotherCowName: '',
        motherCowId: '',
        motherCowName: '',
        motherName: '',
        sireName: '',
      }));
      return;
    }

    const cow = cattleOptions.find((item) => String(item.id) === value);
    if (!cow) {
      setForm((prev) => ({ ...prev, breedingId: '' }));
      return;
    }

    const method = form.breedingMethod || '';
    const candidates = breedingsForCow(cow, method);
    if (candidates.length === 1) {
      applyBreedingRecord(candidates[0]);
      return;
    }

    setForm((prev) => {
      const cowId = String(cow.earTag || cow.id);
      if (prev.breedingMethod === '受精卵移植') {
        return {
          ...prev,
          breedingId: '',
          recipientCowId: cowId,
          recipientCowName: cow.name || '',
          geneticMotherCowId: '',
          geneticMotherCowName: '',
          motherCowId: '',
          motherCowName: '',
          motherName: '',
          sireName: '',
        };
      }

      return {
        ...prev,
        breedingId: '',
        motherCowId: cowId,
        motherCowName: cow.name || '',
        motherName: cow.name || '',
        recipientCowId: '',
        recipientCowName: '',
        geneticMotherCowId: '',
        geneticMotherCowName: '',
        sireName: '',
      };
    });
  }

  function applyBreedingRecord(record: Breeding) {
    const isEt = record.breedingMethod === '受精卵移植';
    setForm((prev) => ({
      ...prev,
      breedingId: String(record.id),
      breedingMethod: isEt ? '受精卵移植' : '人工授精',
      ...(isEt
        ? {
            recipientCowId: record.cowEarTag || '',
            recipientCowName: record.cowName || '',
            geneticMotherCowId: record.donorCowEarTag || '',
            geneticMotherCowName: record.donorCowName || '',
            motherCowId: record.donorCowEarTag || '',
            motherCowName: record.donorCowName || '',
            motherName: record.donorCowName || '',
            sireName: record.embryoSireName || '',
          }
        : {
            recipientCowId: '',
            recipientCowName: '',
            geneticMotherCowId: '',
            geneticMotherCowName: '',
            motherCowId: record.cowEarTag || '',
            motherCowName: record.cowName || '',
            motherName: record.cowName || '',
            sireName: record.bullName || '',
          }),
    }));
  }

  function selectLinkedBreeding(value: string) {
    const record = breedingOptions.find((item) => String(item.id) === value);
    if (!record) {
      setValue('breedingId', '');
      return;
    }
    applyBreedingRecord(record);
  }

  const handleSubmit = async () => {
    if (savingRef.current || certificateSavedRef.current) return;
    const saveRoute = certificateRouteRef.current;
    const currentSave = () => certificateRouteRef.current === saveRoute;
    const saveOwner = certificateOwnerRef.current;
    setErrorMessage('');
    setSuccessMessage('');
    setSyncWarning('');

    if (!form.birthday) {
      setErrorMessage('生年月日は必須です。');
      return;
    }
    const identificationNumber = String(form.identificationNumber || '').trim();
    if (identificationNumber && !/^\d{10}$/.test(identificationNumber)) {
      setErrorMessage('個体識別番号は10桁の数字で入力してください。');
      return;
    }
    if (form.managementStatus === '繁殖候補として留保' && form.sex !== '雌') {
      setErrorMessage('繁殖候補として留保できるのは雌の子牛です。');
      return;
    }

    savingRef.current = true;
    try {
      aiDraft.assertCurrent();
      assertCertificateOwner(saveOwner);
      setSaving(true);
      if (certificateApplied) {
        const errors = validateCalfCertificateForm(form);
        if (errors.length) throw new Error(errors.join(' / '));
        assertCertificateIdentity(form);
        const [calves, cattle] = await Promise.all([
          getAllRecords<Calf & StoredRecord>('calves'),
          getAllRecords<Cattle & StoredRecord>('cattle'),
        ]);
        if (!currentSave()) return;
        assertCertificateOwner(saveOwner);
        const duplicates = findCalfCertificateDuplicates(form, calves, cattle, mode === 'edit' && id
          ? { id, identificationNumber: originalCertificateIdentity.current?.identificationNumber } : undefined);
        setCertificateDuplicates(duplicates);
        if (duplicates.length) throw new Error('この個体は登録済みです。下の登録済みの個体を確認してください。');
      }
      if (!currentSave()) return;
      assertCertificateOwner(saveOwner);
      if (mode === 'create' && !savedLocalId) {
        const created = await createCalf(form);
        if (!currentSave()) return;
        if (certificateApplied) certificateSavedRef.current = true;
        aiDraft.assertCurrent();
        assertCertificateOwner(saveOwner);
        setSavedLocalId(String(created.id));
        if (created.syncWarning) {
          setSuccessMessage('端末内には登録できました。');
          setSyncWarning('この端末に保存済みですが、クラウド同期を保留しています。');
          navigate(`/calves/${created.id}/edit`, { replace: true });
          return;
        }
        setSuccessMessage('登録しました。');
      } else if (id || savedLocalId) {
        const updated = await updateCalf(id || savedLocalId!, form);
        if (!currentSave()) return;
        if (certificateApplied && !updated.syncWarning) certificateSavedRef.current = true;
        aiDraft.assertCurrent();
        assertCertificateOwner(saveOwner);
        setSuccessMessage('端末内のデータを更新しました。');
        if (updated.syncWarning) {
          setSyncWarning('この端末に保存済みですが、クラウド同期を保留しています。');
          return;
        }
      }
      setTimeout(() => { if (currentSave()) navigate('/calves'); }, 700);
    } catch (error) {
      if (!currentSave()) return;
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : '登録・更新に失敗しました。');
    } finally {
      if (currentSave()) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;
  if (mode === 'edit' && editLoadFailed) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>子牛を編集</Typography>
        <Alert severity="error">{errorMessage || '指定された子牛が見つかりません。'}</Alert>
        <Button component={RouterLink} to="/calves" variant="contained" sx={{ alignSelf: 'flex-start' }}>
          子牛台帳へ戻る
        </Button>
      </Stack>
    );
  }

  const dg = calculateDg(form.startWeight, form.currentWeight, form.elapsedDays);
  const age = calculateAgeMonthsAndDays(form.birthday);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '子牛を新規登録' : '子牛を編集'}</Typography>
      <AiRecordDraftNotice draft={aiDraft.draft} />
      <Typography color="text.secondary">
        基本情報と成長記録を登録します。哺育・離乳は「子牛情報 → 記録 → 哺育・離乳」から入力します。
      </Typography>
      {successMessage && <Alert severity="success" ref={certificateNoticeRef} tabIndex={-1}>{successMessage}</Alert>}
      {syncWarning && <Alert severity="warning">{syncWarning}</Alert>}
      {errorMessage && <Alert severity="error" ref={certificateErrorRef} tabIndex={-1}>{errorMessage}</Alert>}
      <CalfCertificateImport key={`${mode}:${id || 'new'}`} currentInput={form} onApply={applyCertificate}
        targetLabel={mode === 'edit' ? originalCertificateIdentity.current?.label : '新しく登録する子牛'}
        autoOpen={openedForCertificate} disabled={saving || certificateSavedRef.current} />
      {certificateDuplicates.length > 0 && <Alert severity="warning"><Stack spacing={1}>
        <Typography>登録済みの個体</Typography>
        {certificateDuplicates.map(match => <Button key={`${match.kind}:${match.id}`} component={RouterLink}
          to={match.url} sx={{ minHeight: 44, textAlign: 'left' }}>{match.label} を確認</Button>)}
      </Stack></Alert>}
      <Card><CardContent><Stack spacing={2}>
        <Grid container spacing={1.25} alignItems="flex-start">
          <Grid item xs={12} lg={9}>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="耳標番号"
                  value={temporaryEarTag ? '' : form.calfNumber}
                  onChange={(e) => {
                    const value = e.target.value;
                    setValue('calfNumber', value);
                    if (value.trim()) setTemporaryEarTag(false);
                  }}
                  fullWidth
                  placeholder={temporaryEarTag ? '耳標装着後に入力' : '未装着なら空欄で保存できます'}
                  helperText={temporaryEarTag ? '耳標未装着です。装着後に正式な耳標番号を入力してください' : '未装着の場合は仮管理番号で保存します'}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="個体識別番号"
                  value={form.identificationNumber}
                  onChange={(e) => setValue('identificationNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                  fullWidth
                  helperText="全国共通の10桁番号です。耳標番号とは別項目です"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="名号"
                  value={form.name}
                  onChange={(e) => setValue('name', e.target.value)}
                  fullWidth
                  helperText="未定なら空欄で保存できます"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="性別"
                  select
                  value={form.sex}
                  onChange={(e) => setValue('sex', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="雌">♀</MenuItem>
                  <MenuItem value="雄">♂</MenuItem>
                  <MenuItem value="去勢">♂去</MenuItem>
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="飼養区分"
                  select
                  value={form.managementStatus}
                  onChange={(e) => setValue('managementStatus', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="販売予定">販売予定</MenuItem>
                  <MenuItem value="販売済み">販売済み</MenuItem>
                  <MenuItem value="育成中">育成中</MenuItem>
                  <MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem>
                  <MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem>
                  <MenuItem value="死亡・その他">死亡・その他</MenuItem>
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="種付方法"
                  select
                  value={form.breedingMethod || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLinkedCowId('');
                    setForm((prev) => ({
                      ...prev,
                      breedingMethod: value,
                      breedingId: '',
                      recipientCowId: '',
                      recipientCowName: '',
                      geneticMotherCowId: '',
                      geneticMotherCowName: '',
                      motherCowId: '',
                      motherCowName: '',
                      motherName: '',
                      sireName: '',
                    }));
                  }}
                  fullWidth
                  helperText="AIは母牛、ETは代理母を選びます。記録が1件なら自動でつなぎます"
                >
                  <MenuItem value="">選択してください</MenuItem>
                  <MenuItem value="人工授精">AI（人工授精）</MenuItem>
                  <MenuItem value="受精卵移植">ET（受精卵移植）</MenuItem>
                </TextField>
              </Grid>

              {mode === 'create' && form.breedingMethod && (
                <>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      label={form.breedingMethod === '受精卵移植' ? '代理母を選ぶ' : '母牛を選ぶ'}
                      select
                      value={linkedCowId}
                      onChange={(e) => selectLinkedCow(e.target.value)}
                      fullWidth
                    >
                      <MenuItem value="">選択してください</MenuItem>
                      {cattleOptions.map((cow) => (
                        <MenuItem key={cow.id} value={String(cow.id)}>
                          {cow.earTag || '-'}・{cow.name || '名号未登録'}
                        </MenuItem>
                      ))}
                      {form.breedingMethod === '受精卵移植' && (
                        <MenuItem value="__manual__">牛台帳にいない代理母を手入力</MenuItem>
                      )}
                    </TextField>
                  </Grid>

                  {linkedCow && linkedBreedings.length > 1 && (
                    <Grid item xs={12} sm={6} md={4}>
                      <TextField
                        label={form.breedingMethod === '受精卵移植'
                          ? 'どのET記録の子牛ですか？'
                          : 'どのAI記録の子牛ですか？'}
                        select
                        value={form.breedingId || ''}
                        onChange={(e) => selectLinkedBreeding(e.target.value)}
                        fullWidth
                        helperText="該当する種付日を選んでください"
                      >
                        <MenuItem value="">記録を選ばず手入力</MenuItem>
                        {linkedBreedings.map((record) => {
                          const isEt = record.breedingMethod === '受精卵移植';
                          const actionDate = record.transferDate || record.inseminationDate || record.heatDate || '';
                          const sire = isEt ? record.embryoSireName : record.bullName;
                          return (
                            <MenuItem key={record.id} value={String(record.id)}>
                              {actionDate || '日付未登録'}　父牛：{sire || '未登録'}
                              {isEt && record.donorCowName ? `　供卵牛：${record.donorCowName}` : ''}
                            </MenuItem>
                          );
                        })}
                      </TextField>
                    </Grid>
                  )}

                  {linkedCow && linkedBreedings.length === 0 && (
                    <Grid item xs={12} sm={6} md={4}>
                      <Alert severity="info">
                        この牛の{form.breedingMethod === '受精卵移植' ? 'ET' : 'AI'}記録はありません。下の欄へ手入力できます。
                      </Alert>
                    </Grid>
                  )}

                  {form.breedingId && linkedBreedings.length <= 1 && (
                    <Grid item xs={12} sm={6} md={4}>
                      <Alert severity="success">
                        {form.breedingMethod === '受精卵移植' ? 'ET' : 'AI'}記録を自動でつなぎました。
                      </Alert>
                    </Grid>
                  )}
                </>
              )}

              {form.breedingMethod === '受精卵移植' ? (
                <>
                  <Grid item xs={12}>
                    <Alert severity="info">
                      ETでは、代理母（受卵牛）と遺伝的な母牛（供卵牛）を分けて登録します。
                    </Alert>
                  </Grid>

                  {mode === 'edit' || linkedCowId === '__manual__' ? (
                    <>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          label="代理母 耳標番号"
                          value={form.recipientCowId || ''}
                          onChange={(e) => setValue('recipientCowId', e.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          label="代理母名"
                          value={form.recipientCowName || ''}
                          onChange={(e) => setValue('recipientCowName', e.target.value)}
                          fullWidth
                        />
                      </Grid>
                    </>
                  ) : linkedCow ? (
                    <Grid item xs={12}>
                      <Alert severity="success">
                        代理母：{linkedCow.earTag || '-'}・{linkedCow.name || '名号未登録'}
                      </Alert>
                    </Grid>
                  ) : null}

                  {(mode === 'edit' || Boolean(linkedCowId)) && (
                    <>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          label="供卵牛 耳標番号"
                          value={form.geneticMotherCowId || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setForm((prev) => ({ ...prev, geneticMotherCowId: value, motherCowId: value }));
                          }}
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <TextField
                          label="供卵牛名"
                          value={form.geneticMotherCowName || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setForm((prev) => ({
                              ...prev,
                              geneticMotherCowName: value,
                              motherName: value,
                              motherCowName: value,
                            }));
                          }}
                          fullWidth
                          helperText="遺伝的な母牛"
                        />
                      </Grid>
                    </>
                  )}
                </>
              ) : (
                <Grid item xs={12} sm={6} md={4}>
                  <TextField
                    label="母牛名"
                    value={form.motherName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setForm((prev) => ({ ...prev, motherName: value, motherCowName: value }));
                    }}
                    fullWidth
                  />
                </Grid>
              )}

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="父牛"
                  value={form.sireName}
                  onChange={(e) => setValue('sireName', e.target.value)}
                  fullWidth
                  helperText={form.breedingMethod === '受精卵移植'
                    ? '受精卵の父牛を入力します'
                    : '分かる場合に入力してください。産歴にも反映されます'}
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12} lg={3}>
            <Stack spacing={1}>
              <BirthdayField
                value={form.birthday}
                onChange={(value) => setValue('birthday', value)}
                required
              />
              <Typography color="text.secondary">
                月齢：{age.label}（日齢：{calculateAgeDays(form.birthday)}日）
              </Typography>
            </Stack>
          </Grid>
        </Grid>

        <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>成長記録を入力</Typography></AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="開始体重(kg)"
                  type="number"
                  value={form.startWeight}
                  onChange={(e) => setValue('startWeight', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="現在体重(kg)"
                  type="number"
                  value={form.currentWeight}
                  onChange={(e) => setValue('currentWeight', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="経過日数"
                  type="number"
                  value={form.elapsedDays}
                  onChange={(e) => setValue('elapsedDays', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex', alignItems: 'center', minHeight: 56 }}>
                <Typography color="text.secondary">DG：{dg.toFixed(2)}kg / 判定：{judgeDg(dg)}</Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="備考"
                  value={form.note}
                  onChange={(e) => setValue('note', e.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {syncWarning && <Alert severity="warning">{syncWarning}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving || certificateSavedRef.current}>{saving ? '保存中...' : '保存'}</Button>
          <Button component={RouterLink} to="/calves" variant="outlined" size="large" disabled={saving}>戻る</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
