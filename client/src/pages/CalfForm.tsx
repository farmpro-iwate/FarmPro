import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BirthdayField } from '../components/BirthdayField';
import { CalfInput } from '../types/calf';
import { createCalf, getCalf, updateCalf } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';

type Props = { mode: 'create' | 'edit' };

const initialForm: CalfInput = {
  calfNumber: '', identificationNumber: '', name: '', birthday: '', sex: '雌', motherName: '',
  startWeight: 0, currentWeight: 0, elapsedDays: 0, milkAmount: 0, starterAmount: 0,
  feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
  weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '',
  managementStatus: '育成中', note: ''
};

export function CalfForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CalfInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getCalf(id).then((d) => setForm({
        calfNumber: d.calfNumber,
        identificationNumber: d.identificationNumber || '',
        name: d.name,
        birthday: d.birthday,
        sex: d.sex,
        motherName: d.motherName,
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
      })).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof CalfInput, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleWeaningStatus = (value: string) => {
    setForm((prev) => ({
      ...prev,
      weaningStatus: value as CalfInput['weaningStatus'],
      weaningDate: value === '離乳前' ? '' : prev.weaningDate,
      milkAmount: value === '離乳済み' && prev.feedingMethod === '人工哺育' ? 0 : prev.milkAmount,
    }));
  };

  const handleSubmit = async () => {
    if (!form.calfNumber || !form.name || !form.birthday) {
      alert('子牛番号、名号、生年月日は必須です');
      return;
    }
    if (form.managementStatus === '繁殖候補として留保' && form.sex !== '雌') {
      alert('繁殖候補として留保できるのは雌の子牛です');
      return;
    }
    if (form.weaningStatus === '離乳済み' && !form.weaningDate) {
      alert('離乳済みにする場合は、実際の離乳日を入力してください');
      return;
    }
    if (mode === 'create') await createCalf(form);
    else if (id) await updateCalf(id, form);
    navigate('/calves');
  };

  if (loading) return <Typography>読み込み中...</Typography>;
  const dg = calculateDg(form.startWeight, form.currentWeight, form.elapsedDays);
  const usesMilk = form.feedingMethod === '人工哺育' || form.feedingMethod === '混合哺育';

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '子牛を新規登録' : '子牛を編集'}</Typography>
      <Card><CardContent><Stack spacing={2}>
        <TextField label="耳標番号" value={form.calfNumber} onChange={(e) => setValue('calfNumber', e.target.value)} required fullWidth />
        <TextField label="個体識別番号" value={form.identificationNumber} onChange={(e) => setValue('identificationNumber', e.target.value)} fullWidth />
        <TextField label="名号" value={form.name} onChange={(e) => setValue('name', e.target.value)} required fullWidth />
        <BirthdayField value={form.birthday} onChange={(value) => setValue('birthday', value)} required />
        <Typography color="text.secondary">日齢：{calculateAgeDays(form.birthday)}日</Typography>
        <TextField label="性別" select value={form.sex} onChange={(e) => setValue('sex', e.target.value)} fullWidth>
          <MenuItem value="雌">雌</MenuItem><MenuItem value="雄">雄</MenuItem><MenuItem value="去勢">去勢</MenuItem>
        </TextField>
        <TextField label="飼養区分" select value={form.managementStatus} onChange={(e) => setValue('managementStatus', e.target.value)} fullWidth>
          <MenuItem value="販売予定">販売予定</MenuItem>
          <MenuItem value="育成中">育成中</MenuItem>
          <MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem>
          <MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem>
          <MenuItem value="死亡・その他">死亡・その他</MenuItem>
        </TextField>
        <TextField label="母牛名" value={form.motherName} onChange={(e) => setValue('motherName', e.target.value)} fullWidth />

        <Typography variant="h6" fontWeight={800}>哺育・離乳管理</Typography>
        <TextField label="哺育方法" select value={form.feedingMethod} onChange={(e) => setValue('feedingMethod', e.target.value)} fullWidth>
          <MenuItem value="人工哺育">人工哺育（代用乳・ミルク）</MenuItem>
          <MenuItem value="母乳哺育">母乳哺育</MenuItem>
          <MenuItem value="混合哺育">混合哺育</MenuItem>
        </TextField>
        <TextField label="離乳状態" select value={form.weaningStatus} onChange={(e) => handleWeaningStatus(e.target.value)} fullWidth>
          <MenuItem value="離乳前">離乳前</MenuItem>
          <MenuItem value="離乳済み">離乳済み</MenuItem>
        </TextField>
        <TextField label="離乳予定日" type="date" value={form.weaningPlannedDate} onChange={(e) => setValue('weaningPlannedDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        <TextField label="実際の離乳日" type="date" value={form.weaningDate} onChange={(e) => setValue('weaningDate', e.target.value)} InputLabelProps={{ shrink: true }} required={form.weaningStatus === '離乳済み'} fullWidth />
        {usesMilk && (
          <TextField label={form.feedingMethod === '混合哺育' ? '補助ミルク終了日' : 'ミルク終了日'} type="date" value={form.milkEndDate} onChange={(e) => setValue('milkEndDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        )}
        {form.feedingMethod === '母乳哺育' && (
          <Alert severity="info">母乳哺育では、母子分離した日を「実際の離乳日」として登録します。</Alert>
        )}
        {form.feedingMethod === '混合哺育' && (
          <Alert severity="info">混合哺育では、補助ミルク終了日と最終的な離乳日を分けて記録できます。</Alert>
        )}
        <TextField label="離乳時体重(kg)" type="number" value={form.weaningWeight} onChange={(e) => setValue('weaningWeight', Number(e.target.value))} fullWidth />
        <TextField label="離乳時スターター量(kg)" type="number" value={form.weaningStarterAmount} onChange={(e) => setValue('weaningStarterAmount', Number(e.target.value))} fullWidth />

        <Typography variant="h6" fontWeight={800}>成長記録</Typography>
        <TextField label="開始体重(kg)" type="number" value={form.startWeight} onChange={(e) => setValue('startWeight', Number(e.target.value))} fullWidth />
        <TextField label="現在体重(kg)" type="number" value={form.currentWeight} onChange={(e) => setValue('currentWeight', Number(e.target.value))} fullWidth />
        <TextField label="経過日数" type="number" value={form.elapsedDays} onChange={(e) => setValue('elapsedDays', Number(e.target.value))} fullWidth />
        <Typography color="text.secondary">DG：{dg.toFixed(2)}kg / 判定：{judgeDg(dg)}</Typography>
        {usesMilk && <TextField label="現在のミルク量(L)" type="number" value={form.milkAmount} onChange={(e) => setValue('milkAmount', Number(e.target.value))} fullWidth />}
        <TextField label="現在のスターター給与量(kg)" type="number" value={form.starterAmount} onChange={(e) => setValue('starterAmount', Number(e.target.value))} fullWidth />
        <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
          <Button component={RouterLink} to="/calves" variant="outlined" size="large">戻る</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
