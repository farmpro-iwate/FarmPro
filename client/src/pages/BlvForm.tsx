import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BlvTestInput } from '../types/blv';
import { createBlvTest, getBlvTest, updateBlvTest } from '../services/blvApi';
import { daysUntil, judgeBlvNextTest } from '../utils/blv';
import { CattlePicker } from '../components/CattlePicker';

type Props = { mode: 'create' | 'edit' };

const initialForm: BlvTestInput = {
  cowEarTag: '',
  cowName: '',
  testDate: '',
  result: '未検査',
  nextTestDate: '',
  isolationMemo: '',
  note: ''
};

export function BlvForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<BlvTestInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getBlvTest(id).then((data) => {
        setForm({
          cowEarTag: data.cowEarTag,
          cowName: data.cowName,
          testDate: data.testDate,
          result: data.result,
          nextTestDate: data.nextTestDate,
          isolationMemo: data.isolationMemo,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof BlvTestInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.cowEarTag || !form.cowName) {
      alert('耳標番号、牛名は必須です');
      return;
    }

    if (mode === 'create') await createBlvTest(form);
    else if (id) await updateBlvTest(id, form);

    navigate('/blv');
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const status = judgeBlvNextTest(form.result, form.nextTestDate);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? 'BLV検査記録を新規登録' : 'BLV検査記録を編集'}</Typography>
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

            <TextField label="耳標番号" value={form.cowEarTag} onChange={(e) => setValue('cowEarTag', e.target.value)} required fullWidth />
            <TextField label="牛名" value={form.cowName} onChange={(e) => setValue('cowName', e.target.value)} required fullWidth />
            <TextField label="検査日" type="date" value={form.testDate} onChange={(e) => setValue('testDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="検査結果" select value={form.result} onChange={(e) => setValue('result', e.target.value)} fullWidth>
              <MenuItem value="未検査">未検査</MenuItem>
              <MenuItem value="陰性">陰性</MenuItem>
              <MenuItem value="陽性">陽性</MenuItem>
            </TextField>
            <TextField label="次回検査予定日" type="date" value={form.nextTestDate} onChange={(e) => setValue('nextTestDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />

            <Typography color="text.secondary">
              判定：{status}{form.nextTestDate ? ` / あと${daysUntil(form.nextTestDate)}日` : ''}
            </Typography>

            <TextField label="陽性牛の隔離メモ" value={form.isolationMemo} onChange={(e) => setValue('isolationMemo', e.target.value)} multiline minRows={3} fullWidth />
            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/blv" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
