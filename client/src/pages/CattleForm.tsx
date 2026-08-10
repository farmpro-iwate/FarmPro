import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { BirthdayField } from '../components/BirthdayField';
import { CattleInput } from '../types/cattle';
import { createCattle, getCattle, updateCattle } from '../services/api';

type Props = { mode: 'create' | 'edit' };

const initialForm: CattleInput = {
  earTag: '',
  identificationNumber: '',
  name: '',
  birthday: '',
  sex: '雌',
  sire: '',
  dam: '',
  parity: 0,
  blvStatus: '未検査',
  note: '',
};

function isValidIdentificationNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  return /^\d{10}$/.test(normalized) || /^\d{4}-\d{4}-\d$/.test(normalized);
}

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
          sex: d.sex ?? '雌',
          sire: d.sire,
          dam: d.dam,
          parity: d.parity,
          blvStatus: d.blvStatus,
          note: d.note,
        }))
        .catch((error) => {
          console.error(error);
          setErrorMessage(error instanceof Error ? error.message : '読み込みに失敗しました。');
        })
        .finally(() => setLoading(false));
    }
  }, [mode, id]);

  const setValue = (key: keyof CattleInput, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSuccessMessage('');
    setErrorMessage('');

    if (!form.earTag.trim() || !form.name.trim() || !form.birthday) {
      setErrorMessage('耳標番号、名号、生年月日は必須です');
      return;
    }

    if (!isValidIdentificationNumber(form.identificationNumber)) {
      setErrorMessage('個体識別番号は10桁の数字、または「4067-7358-1」のような帳票記載形式で入力してください。');
      return;
    }

    try {
      setSaving(true);
      if (mode === 'create') {
        await createCattle(form);
        setSuccessMessage('端末内に登録しました');
      } else if (id) {
        await updateCattle(id, form);
        setSuccessMessage('端末内のデータを更新しました');
      }

      setTimeout(() => {
        navigate('/cattle');
      }, 700);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : '登録・更新に失敗しました。');
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
      <Typography color="text.secondary">
        まず基本情報だけ入力して保存できます。詳しい情報は必要なときに開いてください。
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
              helperText="農場内で牛を見分ける番号です（例：9130）"
            />
            <TextField
              label="個体識別番号"
              value={form.identificationNumber}
              onChange={(e) => setValue('identificationNumber', e.target.value.replace(/[^0-9-]/g, '').slice(0, 11))}
              inputProps={{ inputMode: 'numeric', maxLength: 11 }}
              fullWidth
              helperText="帳票に記載された個体識別番号を入力します。10桁数字またはハイフン入り形式に対応します。耳標番号とは別項目です。"
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
              label="性別"
              select
              value={form.sex}
              onChange={(e) => setValue('sex', e.target.value)}
              required
              fullWidth
            >
              <MenuItem value="雌">♀</MenuItem>
              <MenuItem value="雄">♂</MenuItem>
              <MenuItem value="去勢">♂去</MenuItem>
            </TextField>

            <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={700}>詳しい情報を入力</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField label="父牛" value={form.sire} onChange={(e) => setValue('sire', e.target.value)} fullWidth />
                  <TextField label="母牛" value={form.dam} onChange={(e) => setValue('dam', e.target.value)} fullWidth />
                  <TextField label="産次" type="number" value={form.parity} onChange={(e) => setValue('parity', Number(e.target.value))} fullWidth />
                  <TextField label="BLV結果" select value={form.blvStatus} onChange={(e) => setValue('blvStatus', e.target.value)} fullWidth>
                    <MenuItem value="未検査">未検査</MenuItem>
                    <MenuItem value="陰性">陰性</MenuItem>
                    <MenuItem value="陽性">陽性</MenuItem>
                  </TextField>
                  <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth />
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button component={RouterLink} to="/cattle" variant="outlined" size="large" disabled={saving}>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
