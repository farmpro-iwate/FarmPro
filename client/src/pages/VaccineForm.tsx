import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { VaccineInput } from '../types/vaccine';
import { createVaccine, getVaccine, updateVaccine } from '../services/vaccineApi';
import { daysUntil, judgeVaccineDue } from '../utils/vaccine';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';
import { MedicineSearchField } from '../components/MedicineSearchField';
type Props = { mode: 'create' | 'edit' };

const initialForm: VaccineInput = {
  targetType: '成牛',
  targetNumber: '',
  targetName: '',
  vaccineName: '',
  vaccinationDate: '',
  nextDueDate: '',
  status: '未接種',
  note: ''
};

export function VaccineForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<VaccineInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getVaccine(id).then((data) => {
        setForm({
          targetType: data.targetType,
          targetNumber: data.targetNumber,
          targetName: data.targetName,
          vaccineName: data.vaccineName,
          vaccinationDate: data.vaccinationDate,
          nextDueDate: data.nextDueDate,
          status: data.status,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof VaccineInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.targetType || !form.targetNumber || !form.targetName || !form.vaccineName) {
      alert('必須項目を入力してください');
      return;
    }

    if (mode === 'create') await createVaccine(form);
    else if (id) await updateVaccine(id, form);

    navigate('/vaccines');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const label = judgeVaccineDue(form.status, form.nextDueDate);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? 'ワクチン記録を新規登録' : 'ワクチン記録を編集'}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CattlePicker
              label="登録済み成牛から選択"
              onSelect={(cattle) => {
                setForm((prev) => ({
                  ...prev,
                  targetType: '成牛',
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
                  targetType: '子牛',
                  targetNumber: calf.calfNumber,
                  targetName: calf.name
                }));
              }}
            />

            <TextField label="対象区分" select value={form.targetType} onChange={(e) => setValue('targetType', e.target.value)} fullWidth>
              <MenuItem value="成牛">成牛</MenuItem>
              <MenuItem value="子牛">子牛</MenuItem>
            </TextField>

            <TextField label="対象番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} required fullWidth />
            <TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} required fullWidth />
            <MedicineSearchField
  value={form.vaccineName}
  onChange={(value) => setValue('vaccineName', value)}
  required
/>
            <TextField label="接種日" type="date" value={form.vaccinationDate} onChange={(e) => setValue('vaccinationDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="次回予定日" type="date" value={form.nextDueDate} onChange={(e) => setValue('nextDueDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

            <TextField label="状態" select value={form.status} onChange={(e) => setValue('status', e.target.value)} fullWidth>
              <MenuItem value="未接種">未接種</MenuItem>
              <MenuItem value="接種済み">接種済み</MenuItem>
            </TextField>

            <Typography color="text.secondary">判定：{label}{form.nextDueDate ? ` / あと${daysUntil(form.nextDueDate)}日` : ''}</Typography>
            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/vaccines" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
