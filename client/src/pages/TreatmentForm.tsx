import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { TreatmentInput } from '../types/treatment';
import { createTreatment, getTreatment, updateTreatment } from '../services/treatmentApi';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';
import { MedicineSearchField, MedicineOption } from '../components/MedicineSearchField';
import { StaffSearchField } from '../components/StaffSearchField';
import { DiseaseSearchField } from '../components/DiseaseSearchField';
import { TreatmentProcedureSearchField } from '../components/TreatmentProcedureSearchField';

type Props = { mode: 'create' | 'edit' };

const recordTypeOptions = [
  { value: '治療', label: '一般治療' },
  { value: '繁殖治療', label: '繁殖治療' },
  { value: '予防', label: '予防' },
  { value: '去勢', label: '去勢' },
  { value: '削蹄', label: '削蹄' },
  { value: 'その他の処置', label: 'その他の処置' }
] as const;
const hoofAbnormalityOptions = ['未記録', '異常なし', '異常あり'] as const;

const initialForm: TreatmentInput = {
  recordType: '治療',
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
  withdrawalEndDate: '',
  veterinarian: '',
  progress: '治療中',
  note: ''
};

function addCalendarDays(dateText: string, days: number) {
  if (!dateText || !Number.isFinite(days)) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function TreatmentForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialTargetNumber = mode === 'create' ? searchParams.get('targetNumber') ?? '' : '';
  const initialTargetName = mode === 'create' ? searchParams.get('targetName') ?? '' : '';
  const returnTo = searchParams.get('returnTo') ?? '';
  const openedFromAnimal = mode === 'create' && Boolean(initialTargetNumber);
  const [form, setForm] = useState<TreatmentInput>(() => ({
    ...initialForm,
    targetNumber: initialTargetNumber,
    targetName: initialTargetName
  }));
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineOption | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...initialForm,
        targetNumber: initialTargetNumber,
        targetName: initialTargetName
      });
      setSelectedMedicine(null);
      return;
    }

    if (mode === 'edit' && id) {
      getTreatment(id).then((data) => {
        setForm({
          recordType: data.recordType || '治療',
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
          withdrawalEndDate: data.withdrawalEndDate,
          veterinarian: data.veterinarian,
          progress: data.progress,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id, initialTargetNumber, initialTargetName]);

  const setValue = (key: keyof TreatmentInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const applyMedicineWithdrawal = (medicine: MedicineOption | null, treatmentDate: string) => {
    if (!medicine || medicine.autoCalculateWithdrawal === false || medicine.meatWithdrawalDays === undefined || !treatmentDate) return '';
    return addCalendarDays(treatmentDate, medicine.meatWithdrawalDays);
  };

  const handleMedicineChange = (name: string, medicine?: MedicineOption | null) => {
    const selected = medicine || null;
    setSelectedMedicine(selected);
    setForm((prev) => {
      const automaticDate = applyMedicineWithdrawal(selected, prev.treatmentDate);
      return {
        ...prev,
        medicine: name,
        withdrawalEndDate: automaticDate || (name ? prev.withdrawalEndDate : '')
      };
    });
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
    if (!form.targetNumber || !form.targetName || !form.treatmentDate) {
      alert('対象番号、対象名、治療日は必須です');
      return false;
    }

    if (['治療', '繁殖治療'].includes(form.recordType || '治療') && !form.symptom.trim()) {
      alert(`${form.recordType || '治療'}記録では症状を入力してください`);
      return false;
    }

    return true;
  };

  const saveTreatment = async () => {
    if (mode === 'create') await createTreatment(form);
    else if (id) await updateTreatment(id, form);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      await saveTreatment();

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
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const recordType = form.recordType || '治療';
  const isBreedingTreatment = recordType === '繁殖治療';
  const isBreedingFinished = isBreedingTreatment && form.progress === '繁殖終了';
  const needsDisease = recordType === '治療' || recordType === '繁殖治療' || recordType === '予防';
  const isCastration = recordType === '去勢';
  const isHoof = recordType === '削蹄';
  const showWithdrawalFields = Boolean(form.medicine?.trim());
  const withdrawal = judgeWithdrawal(form.withdrawalEndDate);
  const automaticWithdrawalAvailable = Boolean(selectedMedicine && selectedMedicine.autoCalculateWithdrawal !== false && selectedMedicine.meatWithdrawalDays !== undefined);

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '治療記録を新規登録' : '治療記録を編集'}</Typography>
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
                <Grid item xs={12} sm={6}>
                  <CattlePicker label="登録済み繁殖牛から選択" onSelect={(cattle) => setForm((prev) => ({ ...prev, targetNumber: cattle.earTag, targetName: cattle.name }))} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <CalfPicker label="登録済み子牛から選択" onSelect={(calf) => setForm((prev) => ({ ...prev, targetNumber: calf.calfNumber, targetName: calf.name }))} />
                </Grid>
                <Grid item xs={12} sm={6}><TextField label="対象番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} required fullWidth /></Grid>
                <Grid item xs={12} sm={6}><TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} required fullWidth /></Grid>
              </Grid>
            )}

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={4}>
                <TextField label="治療区分" select value={recordType} onChange={(e) => setValue('recordType', e.target.value)} fullWidth>
                  {recordTypeOptions.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField
                  label={needsDisease ? '症状' : '症状（任意）'}
                  value={form.symptom}
                  onChange={(e) => setValue('symptom', e.target.value)}
                  required={needsDisease}
                  placeholder={isBreedingTreatment ? '例：無発情、発情微弱、再発情、長期不受胎' : undefined}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={3}><TextField label="治療日" type="date" value={form.treatmentDate} onChange={(e) => handleTreatmentDateChange(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth /></Grid>
            </Grid>

            {isBreedingTreatment && (
              <Alert severity="info">
                繁殖に関する診断・処置を記録し、次回予定には再診、発情確認、授精予定などの日付を入力します。
              </Alert>
            )}

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}>
                <DiseaseSearchField
                  label={isBreedingTreatment ? '繁殖診断名' : isCastration || isHoof ? '疾病名（任意）' : '疾病名（診断名）'}
                  value={form.diagnosis}
                  masterId={form.diseaseMasterId}
                  onChange={(value, masterId) => { setValue('diagnosis', value); setForm((prev) => ({ ...prev, diseaseMasterId: masterId })); }}
                  required={needsDisease}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
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
              <Grid item xs={12} sm={4}><StaffSearchField label="獣医師名" value={form.veterinarian} onChange={(value) => setValue('veterinarian', value)} /></Grid>
              <Grid item xs={12} sm={4}>
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
              </Grid>
              <Grid item xs={12} sm={4}>
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving} fullWidth>
                {saving ? '保存中...' : isBreedingFinished ? '保存して次へ' : '保存'}
              </Button>
              <Button component={RouterLink} to={returnTo || '/treatments'} variant="outlined" size="large" fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
