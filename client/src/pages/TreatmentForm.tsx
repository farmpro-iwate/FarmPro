import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { TreatmentInput } from '../types/treatment';
import { createTreatment, getTreatment, updateTreatment } from '../services/treatmentApi';
import { daysUntil, judgeWithdrawal } from '../utils/treatment';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';
import { MedicineSearchField } from '../components/MedicineSearchField';
import { StaffSearchField } from '../components/StaffSearchField';
import { DiseaseSearchField } from '../components/DiseaseSearchField';
import { TreatmentProcedureSearchField } from '../components/TreatmentProcedureSearchField';

type Props = { mode: 'create' | 'edit' };

const recordTypeOptions = ['治療', '予防', '去勢', '削蹄', 'その他の処置'] as const;
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

export function TreatmentForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<TreatmentInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
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
  }, [mode, id]);

  const setValue = (key: keyof TreatmentInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.targetNumber || !form.targetName || !form.treatmentDate) {
      alert('対象番号、対象名、治療日は必須です');
      return;
    }

    if ((form.recordType || '治療') === '治療' && !form.symptom.trim()) {
      alert('治療記録では症状を入力してください');
      return;
    }

    if (mode === 'create') await createTreatment(form);
    else if (id) await updateTreatment(id, form);

    navigate('/treatments');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const recordType = form.recordType || '治療';
  const needsDisease = recordType === '治療' || recordType === '予防';
  const isCastration = recordType === '去勢';
  const isHoof = recordType === '削蹄';
  const showWithdrawalFields = Boolean(form.medicine?.trim());

  const withdrawal = judgeWithdrawal(form.withdrawalEndDate);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '治療記録を新規登録' : '治療記録を編集'}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CattlePicker
              label="登録済み成牛から選択"
              onSelect={(cattle) => {
                setForm((prev) => ({
                  ...prev,
                  targetNumber: cattle.earTag,
                  targetName: cattle.name
                }));
              }}
            />

            <CalfPicker
              label="登録済み子牛から選択"
              onSelect={(calf) => {
                setForm((prev) => ({
                  ...prev,
                  targetNumber: calf.calfNumber,
                  targetName: calf.name
                }));
              }}
            />

            <TextField label="対象番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} required fullWidth />
            <TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} required fullWidth />
            <TextField
              label="記録区分"
              select
              value={recordType}
              onChange={(e) => setValue('recordType', e.target.value)}
              fullWidth
            >
              {recordTypeOptions.map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </TextField>
            <TextField label={needsDisease ? '症状' : '症状（任意）'} value={form.symptom} onChange={(e) => setValue('symptom', e.target.value)} required={needsDisease} fullWidth />
            <TextField label="治療日" type="date" value={form.treatmentDate} onChange={(e) => setValue('treatmentDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <DiseaseSearchField
              label={isCastration || isHoof ? '疾病名（任意）' : '疾病名（診断名）'}
              value={form.diagnosis}
              masterId={form.diseaseMasterId}
              onChange={(value, masterId) => {
                setValue('diagnosis', value);
                setForm((prev) => ({ ...prev, diseaseMasterId: masterId }));
              }}
              required={needsDisease}
            />
            <TreatmentProcedureSearchField
              value={form.treatmentProcedure || ''}
              masterId={form.treatmentProcedureMasterId}
              onChange={(value, masterId) => {
                setForm((prev) => ({ ...prev, treatmentProcedure: value, treatmentProcedureMasterId: masterId }));
              }}
              required={isCastration || isHoof}
            />

            {isHoof && (
              <TextField
                label="異常の有無"
                select
                value={form.hoofAbnormality || '未記録'}
                onChange={(e) => setValue('hoofAbnormality', e.target.value)}
                fullWidth
              >
                {hoofAbnormalityOptions.map((item) => (
                  <MenuItem key={item} value={item}>{item}</MenuItem>
                ))}
              </TextField>
            )}

            <MedicineSearchField value={form.medicine} onChange={(value) => setValue('medicine', value)} />
            <TextField label="投薬量" value={form.dosage} onChange={(e) => setValue('dosage', e.target.value)} fullWidth />
            {showWithdrawalFields && (
              <>
                <TextField label="休薬期間終了日" type="date" value={form.withdrawalEndDate} onChange={(e) => setValue('withdrawalEndDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                <Typography color="text.secondary">
                  休薬判定：{withdrawal}{form.withdrawalEndDate ? ` / あと${daysUntil(form.withdrawalEndDate)}日` : ''}
                </Typography>
              </>
            )}

            {!showWithdrawalFields && (
              <Typography color="text.secondary">薬剤を使用した場合のみ、休薬情報を入力してください。</Typography>
            )}

            <StaffSearchField
              label="獣医師名"
              value={form.veterinarian}
              onChange={(value) => setValue('veterinarian', value)}
            />

            <TextField label="経過" select value={form.progress} onChange={(e) => setValue('progress', e.target.value)} fullWidth>
              <MenuItem value="治療中">治療中</MenuItem>
              <MenuItem value="経過観察">経過観察</MenuItem>
              <MenuItem value="回復">回復</MenuItem>
              <MenuItem value="要再診">要再診</MenuItem>
            </TextField>

            <TextField
              label="次回予定日（任意）"
              type="date"
              value={form.nextScheduledDate || ''}
              onChange={(e) => setValue('nextScheduledDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/treatments" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
