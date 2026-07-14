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

const initialForm: TreatmentInput = {
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
          targetNumber: data.targetNumber,
          targetName: data.targetName,
          symptom: data.symptom,
          diagnosis: data.diagnosis,
          diseaseMasterId: data.diseaseMasterId,
          treatmentProcedure: data.treatmentProcedure || '',
          treatmentProcedureMasterId: data.treatmentProcedureMasterId,
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
    if (!form.targetNumber || !form.targetName || !form.symptom || !form.treatmentDate) {
      alert('対象番号、対象名、症状、治療日は必須です');
      return;
    }

    if (mode === 'create') await createTreatment(form);
    else if (id) await updateTreatment(id, form);

    navigate('/treatments');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

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
            <TextField label="症状" value={form.symptom} onChange={(e) => setValue('symptom', e.target.value)} required fullWidth />
            <DiseaseSearchField
              label="疾病名（診断名）"
              value={form.diagnosis}
              masterId={form.diseaseMasterId}
              onChange={(value, masterId) => {
                setValue('diagnosis', value);
                setForm((prev) => ({ ...prev, diseaseMasterId: masterId }));
              }}
            />
            <TreatmentProcedureSearchField
              value={form.treatmentProcedure || ''}
              masterId={form.treatmentProcedureMasterId}
              onChange={(value, masterId) => {
                setForm((prev) => ({ ...prev, treatmentProcedure: value, treatmentProcedureMasterId: masterId }));
              }}
            />
            <TextField label="治療日" type="date" value={form.treatmentDate} onChange={(e) => setValue('treatmentDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <MedicineSearchField value={form.medicine} onChange={(value) => setValue('medicine', value)} />
            <TextField label="投薬量" value={form.dosage} onChange={(e) => setValue('dosage', e.target.value)} fullWidth />
            <TextField label="休薬期間終了日" type="date" value={form.withdrawalEndDate} onChange={(e) => setValue('withdrawalEndDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

            <Typography color="text.secondary">
              休薬判定：{withdrawal}{form.withdrawalEndDate ? ` / あと${daysUntil(form.withdrawalEndDate)}日` : ''}
            </Typography>

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
