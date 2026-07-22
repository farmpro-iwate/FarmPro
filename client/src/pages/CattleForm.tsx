import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BirthdayField } from '../components/BirthdayField';
import { CattleInput } from '../types/cattle';
import { createCattle, getCattle, updateCattle } from '../services/api';

type Props = { mode: 'create' | 'edit' };

const initialForm: CattleInput = {
  earTag: '',
  identificationNumber: '',
  name: '',
  birthday: '',
  sire: '',
  dam: '',
  parity: 0,
  blvStatus: '未検査',
  note: '',
};

export function CattleForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CattleInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (mode === 'edit' && id) {
      getCattle(id)
        .then((d) => setForm({
          earTag: d.earTag,
          identificationNumber: d.identificationNumber ?? '',
          name: d.name,
          birthday: d.birthday,
          sire: d.sire,
          dam: d.dam,
          parity: d.parity,
          blvStatus: d.blvStatus,
          note: d.note,
        }))
        .finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof CattleInput, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSuccessMessage('');
    setErrorMessage('');

    if (!form.earTag || !form.name || !form.birthday) {
      setErrorMessage('耳標番号、名号、生年月日は必須です');
      return;
    }

    try {
      setSaving(true);
      if (mode === 'create') {
        await createCattle(form);
        setSuccessMessage('登録しました');
      } else if (id) {
        await updateCattle(id, form);
        setSuccessMessage('更新しました');
      }

      setTimeout(() => {
        navigate('/cattle');
      }, 700);
    } catch (error) {
      console.error(error);
      setErrorMessage('登録・更新に失敗しました。耳標番号の重複や入力内容を確認してください。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        {mode === 'create' ? '牛を新規登録' : '牛を編集'}
      </Typography>

      {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="耳標番号"
              value={form.earTag}
              onChange={(e) => setValue('earTag', e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="個体識別番号"
              value={form.identificationNumber}
              onChange={(e) => setValue('identificationNumber', e.target.value)}
              fullWidth
              helperText="10桁の個体識別番号を入力できます"
            />
            <TextField
              label="名号"
              value={form.name}
              onChange={(e) => setValue('name', e.target.value)}
              required
              fullWidth
            />
            <BirthdayField
              value={form.birthday}
              onChange={(value) => setValue('birthday', value)}
              required
            />
            <TextField
              label="父牛"
              value={form.sire}
              onChange={(e) => setValue('sire', e.target.value)}
              fullWidth
            />
            <TextField
              label="母牛"
              value={form.dam}
              onChange={(e) => setValue('dam', e.target.value)}
              fullWidth
            />
            <TextField
              label="産次"
              type="number"
              value={form.parity}
              onChange={(e) => setValue('parity', Number(e.target.value))}
              fullWidth
            />
            <TextField
              label="BLV結果"
              select
              value={form.blvStatus}
              onChange={(e) => setValue('blvStatus', e.target.value)}
              fullWidth
            >
              <MenuItem value="未検査">未検査</MenuItem>
              <MenuItem value="陰性">陰性</MenuItem>
              <MenuItem value="陽性">陽性</MenuItem>
            </TextField>
            <TextField
              label="備考"
              value={form.note}
              onChange={(e) => setValue('note', e.target.value)}
              multiline
              minRows={3}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                size="large"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button
                component={RouterLink}
                to="/cattle"
                variant="outlined"
                size="large"
                disabled={saving}
              >
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
