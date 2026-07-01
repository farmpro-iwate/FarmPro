import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CalfInput } from '../types/calf';
import { createCalf, getCalf, updateCalf } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';

type Props = { mode: 'create' | 'edit' };

const initialForm: CalfInput = {
  calfNumber: '', name: '', birthday: '', sex: '雌', motherName: '',
  startWeight: 0, currentWeight: 0, elapsedDays: 0, milkAmount: 0, starterAmount: 0, note: ''
};

export function CalfForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CalfInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getCalf(id).then((data) => {
        setForm({
          calfNumber: data.calfNumber, name: data.name, birthday: data.birthday,
          sex: data.sex, motherName: data.motherName, startWeight: data.startWeight,
          currentWeight: data.currentWeight, elapsedDays: data.elapsedDays,
          milkAmount: data.milkAmount, starterAmount: data.starterAmount, note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof CalfInput, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.calfNumber || !form.name || !form.birthday) {
      alert('子牛番号、名号、生年月日は必須です');
      return;
    }
    try {
      if (mode === 'create') await createCalf(form);
      else if (id) await updateCalf(id, form);
      navigate('/calves');
    } catch {
      alert('保存に失敗しました。子牛番号が重複していないか確認してください。');
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const dg = calculateDg(form.startWeight, form.currentWeight, form.elapsedDays);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '子牛を新規登録' : '子牛を編集'}</Typography>
      <Card><CardContent><Stack spacing={2}>
        <TextField label="子牛番号" value={form.calfNumber} onChange={(e) => setValue('calfNumber', e.target.value)} required fullWidth />
        <TextField label="名号" value={form.name} onChange={(e) => setValue('name', e.target.value)} required fullWidth />
        <TextField label="生年月日" type="date" value={form.birthday} onChange={(e) => setValue('birthday', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
        <Typography color="text.secondary">日齢：{calculateAgeDays(form.birthday)}日</Typography>
        <TextField label="性別" select value={form.sex} onChange={(e) => setValue('sex', e.target.value)} fullWidth>
          <MenuItem value="雌">雌</MenuItem><MenuItem value="雄">雄</MenuItem>
        </TextField>
        <TextField label="母牛名" value={form.motherName} onChange={(e) => setValue('motherName', e.target.value)} fullWidth />
        <TextField label="開始体重(kg)" type="number" value={form.startWeight} onChange={(e) => setValue('startWeight', Number(e.target.value))} fullWidth />
        <TextField label="現在体重(kg)" type="number" value={form.currentWeight} onChange={(e) => setValue('currentWeight', Number(e.target.value))} fullWidth />
        <TextField label="経過日数" type="number" value={form.elapsedDays} onChange={(e) => setValue('elapsedDays', Number(e.target.value))} fullWidth />
        <Typography color="text.secondary">DG：{dg.toFixed(2)}kg / 判定：{judgeDg(dg)}</Typography>
        <TextField label="ミルク量(L)" type="number" value={form.milkAmount} onChange={(e) => setValue('milkAmount', Number(e.target.value))} fullWidth />
        <TextField label="スターター給与量(kg)" type="number" value={form.starterAmount} onChange={(e) => setValue('starterAmount', Number(e.target.value))} fullWidth />
        <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />
        <Stack direction="row" spacing={1}>
          <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
          <Button component={RouterLink} to="/calves" variant="outlined" size="large">戻る</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
