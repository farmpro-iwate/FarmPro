import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CattleInput } from '../types/cattle';
import { createCattle, getCattle, updateCattle } from '../services/api';

type Props = { mode: 'create' | 'edit' };

const initialForm: CattleInput = { earTag: '', name: '', birthday: '', sire: '', dam: '', parity: 0, blvStatus: '未検査', note: '' };

export function CattleForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CattleInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getCattle(id).then((data) => {
        setForm({ earTag: data.earTag, name: data.name, birthday: data.birthday, sire: data.sire, dam: data.dam, parity: data.parity, blvStatus: data.blvStatus, note: data.note });
      }).finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof CattleInput, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.earTag || !form.name || !form.birthday) {
      alert('個体番号、名号、生年月日は必須です');
      return;
    }
    try {
      if (mode === 'create') await createCattle(form);
      else if (id) await updateCattle(id, form);
      navigate('/cattle');
    } catch {
      alert('保存に失敗しました。個体番号が重複していないか確認してください。');
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '牛を新規登録' : '牛を編集'}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField label="個体番号" value={form.earTag} onChange={(e) => setValue('earTag', e.target.value)} required fullWidth />
            <TextField label="名号" value={form.name} onChange={(e) => setValue('name', e.target.value)} required fullWidth />
            <TextField label="生年月日" type="date" value={form.birthday} onChange={(e) => setValue('birthday', e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
            <TextField label="父牛" value={form.sire} onChange={(e) => setValue('sire', e.target.value)} fullWidth />
            <TextField label="母牛" value={form.dam} onChange={(e) => setValue('dam', e.target.value)} fullWidth />
            <TextField label="産次" type="number" value={form.parity} onChange={(e) => setValue('parity', Number(e.target.value))} fullWidth />
            <TextField label="BLV結果" select value={form.blvStatus} onChange={(e) => setValue('blvStatus', e.target.value)} fullWidth>
              <MenuItem value="未検査">未検査</MenuItem><MenuItem value="陰性">陰性</MenuItem><MenuItem value="陽性">陽性</MenuItem>
            </TextField>
            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit}>保存</Button>
              <Button component={RouterLink} to="/cattle" variant="outlined" size="large">戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
