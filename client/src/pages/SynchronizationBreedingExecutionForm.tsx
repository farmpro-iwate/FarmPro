import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
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
import { InseminatorSearchField } from '../components/InseminatorSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';
import { SireSearchField } from '../components/SireSearchField';
import { createBreeding } from '../services/breedingApi';
import { getSchedule, updateSchedule } from '../services/scheduleApi';
import { getFarmSettings } from '../services/settingsApi';
import type { BreedingInput } from '../types/breeding';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpectedDate,
} from '../utils/breeding';

const emptyBreeding: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
  estrusType: '繁殖治療による発情',
  breedingMethod: '未選択',
  breedingStatus: '発情確認',
  inseminationDate: '',
  bullName: '',
  bullMasterId: undefined,
  inseminatorName: '',
  inseminatorMasterId: undefined,
  transferPlannedDate: '',
  transferDate: '',
  transferCancelReason: '',
  embryoNumber: '',
  collectionDate: '',
  embryoType: '未選択',
  donorCowName: '',
  donorCowEarTag: '',
  embryoSireName: '',
  embryoSireMasterId: undefined,
  embryoGrade: '',
  strawNumber: '',
  supplierName: '',
  supplierMasterId: undefined,
  transferTechnician: '',
  transferTechnicianMasterId: undefined,
  nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '',
  estrusSigns: [],
  estrusSignsOther: '',
  synchronizationProgramId: '',
  synchronizationProgramName: '',
  sourceScheduleId: '',
  note: '',
};

export function SynchronizationBreedingExecutionForm() {
  const navigate = useNavigate();
  const { kind } = useParams();
  const [searchParams] = useSearchParams();
  const isTransfer = kind === 'transfer';
  const returnTo = searchParams.get('returnTo') || '/schedules';
  const sourceScheduleId = searchParams.get('sourceScheduleId') || '';
  const actionDate = searchParams.get('actionDate') || '';

  const [form, setForm] = useState<BreedingInput>(() => ({
    ...emptyBreeding,
    cowEarTag: searchParams.get('targetNumber') || '',
    cowName: searchParams.get('targetName') || '',
    heatDate: actionDate,
    breedingMethod: isTransfer ? '受精卵移植' : '種付',
    breedingStatus: isTransfer ? '移植実施' : '種付実施',
    inseminationDate: isTransfer ? '' : actionDate,
    transferDate: isTransfer ? actionDate : '',
    synchronizationProgramId: searchParams.get('programId') || '',
    synchronizationProgramName: searchParams.get('programName') || '',
    sourceScheduleId,
  }));
  const [saving, setSaving] = useState(false);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const completeSourceSchedule = async () => {
    if (!sourceScheduleId) return;
    const schedule = await getSchedule(sourceScheduleId);
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
  };

  const handleSave = async () => {
    const date = isTransfer ? form.transferDate : form.inseminationDate;
    if (!form.cowEarTag || !form.cowName) return alert('対象牛がありません');
    if (!date) return alert(isTransfer ? '移植実施日を入力してください' : '種付・授精日を入力してください');

    setSaving(true);
    try {
      const settings = await getFarmSettings();
      const cycleDays = settings.estrousCycleDays || 21;
      await createBreeding({
        ...form,
        heatDate: form.heatDate || date,
        estrusType: '繁殖治療による発情',
        breedingMethod: isTransfer ? '受精卵移植' : '種付',
        breedingStatus: isTransfer ? '移植実施' : '種付実施',
        nextHeatExpectedDate: calculateNextHeatExpectedDate(date, cycleDays),
        pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(date, cycleDays),
        expectedCalvingDate: calculateExpectedCalvingDate(date),
      });
      await completeSourceSchedule();
      navigate(returnTo);
    } finally {
      setSaving(false);
    }
  };

  const title = isTransfer ? '同期化から受精卵移植を実施' : '同期化から人工授精を実施';

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>{title}</Typography>
      <Alert severity="info">
        同期化プログラムの予定から直接登録します。保存すると元の予定は完了になります。
      </Alert>
      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={3}><Typography fontWeight={800}>対象牛</Typography></Grid>
                  <Grid item xs={12} sm={9}><Typography>{form.cowName}（耳標 {form.cowEarTag}）</Typography></Grid>
                  {form.synchronizationProgramName && <><Grid item xs={12} sm={3}><Typography fontWeight={800}>同期化</Typography></Grid><Grid item xs={12} sm={9}><Typography>{form.synchronizationProgramName}</Typography></Grid></>}
                </Grid>
              </CardContent>
            </Card>

            {!isTransfer ? (
              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={4}><TextField label="種付・授精日" type="date" value={form.inseminationDate} onChange={(e) => setValue('inseminationDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth /></Grid>
                <Grid item xs={12} sm={4}><SireSearchField value={form.bullName} masterId={form.bullMasterId} onChange={(name, masterId) => setForm((prev) => ({ ...prev, bullName: name, bullMasterId: masterId }))} label="種雄牛" /></Grid>
                <Grid item xs={12} sm={4}><InseminatorSearchField value={form.inseminatorName} masterId={form.inseminatorMasterId} onChange={(name, masterId) => setForm((prev) => ({ ...prev, inseminatorName: name, inseminatorMasterId: masterId }))} /></Grid>
              </Grid>
            ) : (
              <>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} sm={6}><TextField label="移植実施日" type="date" value={form.transferDate} onChange={(e) => setValue('transferDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="受精卵番号・管理番号" value={form.embryoNumber} onChange={(e) => setValue('embryoNumber', e.target.value)} fullWidth /></Grid>
                  <Grid item xs={12} sm={4}><TextField label="採卵日" type="date" value={form.collectionDate} onChange={(e) => setValue('collectionDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
                  <Grid item xs={12} sm={4}><TextField label="受精卵区分" select value={form.embryoType} onChange={(e) => setValue('embryoType', e.target.value)} fullWidth><MenuItem value="未選択">未選択</MenuItem><MenuItem value="新鮮卵">新鮮卵</MenuItem><MenuItem value="凍結卵">凍結卵</MenuItem></TextField></Grid>
                  <Grid item xs={12} sm={4}><TextField label="受精卵ランク・品質" value={form.embryoGrade} onChange={(e) => setValue('embryoGrade', e.target.value)} fullWidth /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="供卵牛名（遺伝的母牛）" value={form.donorCowName} onChange={(e) => setValue('donorCowName', e.target.value)} fullWidth /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="供卵牛耳標番号" value={form.donorCowEarTag} onChange={(e) => setValue('donorCowEarTag', e.target.value)} fullWidth /></Grid>
                  <Grid item xs={12} sm={6}><SireSearchField value={form.embryoSireName} masterId={form.embryoSireMasterId} onChange={(name, masterId) => setForm((prev) => ({ ...prev, embryoSireName: name, embryoSireMasterId: masterId }))} label="受精卵の父牛" /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="ストロー番号" value={form.strawNumber} onChange={(e) => setValue('strawNumber', e.target.value)} fullWidth /></Grid>
                  <Grid item xs={12} sm={6}><PartnerSearchField label="購入先・所有者" value={form.supplierName} masterId={form.supplierMasterId} onChange={(name, masterId) => setForm((prev) => ({ ...prev, supplierName: name, supplierMasterId: masterId }))} /></Grid>
                  <Grid item xs={12} sm={6}><InseminatorSearchField label="移植担当者" value={form.transferTechnician} masterId={form.transferTechnicianMasterId} onChange={(name, masterId) => setForm((prev) => ({ ...prev, transferTechnician: name, transferTechnicianMasterId: masterId }))} /></Grid>
                </Grid>
              </>
            )}

            <TextField label="メモ" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={2} fullWidth />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSave} disabled={saving} fullWidth>{saving ? '保存中...' : '実施を保存'}</Button>
              <Button variant="outlined" size="large" onClick={() => navigate(returnTo)} fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
