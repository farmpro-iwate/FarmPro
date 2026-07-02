import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ScheduleInput } from '../types/schedule';
import { createSchedule, getSchedule, updateSchedule } from '../services/scheduleApi';
import { daysUntil, judgeSchedule } from '../utils/schedule';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';

type Props = { mode: 'create' | 'edit' };

const initialForm: ScheduleInput = {
  scheduleType: 'その他',
  title: '',
  targetNumber: '',
  targetName: '',
  dueDate: '',
  status: '未完了',
  note: ''
};

export function ScheduleForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<ScheduleInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getSchedule(id).then((data) => {
        setForm({
          scheduleType: data.scheduleType,
          title: data.title,
          targetNumber: data.targetNumber,
          targetName: data.targetName,
          dueDate: data.dueDate,
          status: data.status,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof ScheduleInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.scheduleType || !form.title || !form.dueDate) {
      alert('予定区分、タイトル、予定日は必須です');
      return;
    }

    if (mode === 'create') await createSchedule(form);
    else if (id) await updateSchedule(id, form);

    navigate('/schedules');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const judge = judgeSchedule(form.status, form.dueDate);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '予定を新規登録' : '予定を編集'}</Typography>
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

            <TextField label="予定区分" select value={form.scheduleType} onChange={(e) => setValue('scheduleType', e.target.value)} fullWidth>
              <MenuItem value="分娩">分娩</MenuItem>
              <MenuItem value="ワクチン">ワクチン</MenuItem>
              <MenuItem value="BLV検査">BLV検査</MenuItem>
              <MenuItem value="妊娠鑑定">妊娠鑑定</MenuItem>
              <MenuItem value="治療">治療</MenuItem>
              <MenuItem value="その他">その他</MenuItem>
            </TextField>

            <TextField label="タイトル" value={form.title} onChange={(e) => setValue('title', e.target.value)} required fullWidth />
            <TextField label="対象番号" value={form.targetNumber} onChange={(e) => setValue('targetNumber', e.target.value)} fullWidth />
            <TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} fullWidth />
            <TextField label="予定日" type="date" value={form.dueDate} onChange={(e) => setValue('dueDate', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />

            <TextField label="状態" select value={form.status} onChange={(e) => setValue('status', e.target.value)} fullWidth>
              <MenuItem value="未完了">未完了</MenuItem>
              <MenuItem value="完了">完了</MenuItem>
            </TextField>

            <Typography color="text.secondary">
              判定：{judge}{form.dueDate && form.status !== '完了' ? ` / あと${daysUntil(form.dueDate)}日` : ''}
            </Typography>

            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/schedules" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
