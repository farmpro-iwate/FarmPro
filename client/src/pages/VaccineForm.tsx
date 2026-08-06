import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const initialTargetNumber = mode === 'create' ? searchParams.get('targetNumber') ?? '' : '';
  const initialTargetName = mode === 'create' ? searchParams.get('targetName') ?? '' : '';
  const requestedTargetType = mode === 'create' ? searchParams.get('targetType') ?? '' : '';
  const initialTargetType = requestedTargetType === '子牛' ? '子牛' : '成牛';
  const openedFromAnimal = mode === 'create' && Boolean(initialTargetNumber);
  const [form, setForm] = useState<VaccineInput>(() => ({
    ...initialForm,
    targetType: initialTargetType,
    targetNumber: initialTargetNumber,
    targetName: initialTargetName
  }));
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...initialForm,
        targetType: initialTargetType,
        targetNumber: initialTargetNumber,
        targetName: initialTargetName
      });
      return;
    }

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
  }, [mode, id, initialTargetType, initialTargetNumber, initialTargetName]);

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
            {openedFromAnimal ? (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={0.5}>
                    <Typography fontWeight={900}>対象個体</Typography>
                    <Typography variant="h6" fontWeight={900}>{form.targetName}</Typography>
                    <Typography color="text.secondary">耳標番号：{form.targetNumber}</Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <>
                <CattlePicker
                  label="登録済み繁殖牛から選択"
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
                  <MenuItem value="成牛">繁殖牛</MenuItem>
                  <MenuItem value="子牛">子牛</MenuItem>
                </TextField>

                <TextField label="対象番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} required fullWidth />
                <TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} required fullWidth />
              </>
            )}

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
            <TextField label="メモ" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} fullWidth>保存</Button>
              <Button component={RouterLink} to="/vaccines" variant="outlined" size="large" fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
