import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BreedingInput } from '../types/breeding';
import { createBreeding, getBreeding, updateBreeding } from '../services/breedingApi';
import { calculateExpectedCalvingDate, daysUntil } from '../utils/breeding';
import { CattlePicker } from '../components/CattlePicker';

type Props = { mode: 'create' | 'edit' };

const initialForm: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
  inseminationDate: '',
  bullName: '',
  pregnancyCheckDate: '',
  pregnancyResult: '未鑑定',
  expectedCalvingDate: '',
  note: ''
};

export function BreedingForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<BreedingInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getBreeding(id).then((data) => {
        setForm({
          cowEarTag: data.cowEarTag,
          cowName: data.cowName,
          heatDate: data.heatDate,
          inseminationDate: data.inseminationDate,
          bullName: data.bullName,
          pregnancyCheckDate: data.pregnancyCheckDate,
          pregnancyResult: data.pregnancyResult,
          expectedCalvingDate: data.expectedCalvingDate,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  useEffect(() => {
    if (form.inseminationDate) {
      setForm((prev) => ({
        ...prev,
        expectedCalvingDate: calculateExpectedCalvingDate(prev.inseminationDate)
      }));
    }
  }, [form.inseminationDate]);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.cowEarTag || !form.cowName || !form.inseminationDate) {
      alert('個体番号、牛名、授精日は必須です');
      return;
    }

    if (mode === 'create') await createBreeding(form);
    else if (id) await updateBreeding(id, form);

    navigate('/breedings');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '繁殖記録を新規登録' : '繁殖記録を編集'}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CattlePicker
              onSelect={(cattle) => {
                setForm((prev) => ({
                  ...prev,
                  cowEarTag: cattle.earTag,
                  cowName: cattle.name
                }));
              }}
            />

            <TextField label="個体番号" value={form.cowEarTag} onChange={(e) => setValue('cowEarTag', e.target.value)} required fullWidth />
            <TextField label="牛名" value={form.cowName} onChange={(e) => setValue('cowName', e.target.value)} required fullWidth />
            <TextField label="発情日" type="date" value={form.heatDate} onChange={(e) => setValue('heatDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="授精日" type="date" value={form.inseminationDate} onChange={(e) => setValue('inseminationDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <TextField label="種雄牛" value={form.bullName} onChange={(e) => setValue('bullName', e.target.value)} fullWidth />
            <TextField label="妊娠鑑定日" type="date" value={form.pregnancyCheckDate} onChange={(e) => setValue('pregnancyCheckDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

            <TextField label="妊娠結果" select value={form.pregnancyResult} onChange={(e) => setValue('pregnancyResult', e.target.value)} fullWidth>
              <MenuItem value="未鑑定">未鑑定</MenuItem>
              <MenuItem value="妊娠">妊娠</MenuItem>
              <MenuItem value="不受胎">不受胎</MenuItem>
            </TextField>

            <TextField label="分娩予定日" type="date" value={form.expectedCalvingDate} onChange={(e) => setValue('expectedCalvingDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <Typography color="text.secondary">分娩予定日まで：あと{daysUntil(form.expectedCalvingDate)}日</Typography>
            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/breedings" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
