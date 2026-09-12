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
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { BirthdayField } from '../components/BirthdayField';
import { CattleInput, type CattleAcquisitionMethod } from '../types/cattle';
import { createCattle, getCattle, syncCattleRecordToCloud, updateCattle } from '../services/api';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';

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
  acquisitionDate: '',
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
          sex: d.sex ?? '雌',
          sire: d.sire,
          dam: d.dam,
          parity: d.parity,
          blvStatus: d.blvStatus,
          acquisitionMethod: d.acquisitionMethod,
          acquisitionDate: d.acquisitionDate ?? '',
          acquisitionPrice: d.acquisitionPrice,
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

  const setAcquisitionMethod = (value: CattleAcquisitionMethod | '') => {
    setForm((prev) => ({
      ...prev,
      acquisitionMethod: value || undefined,
      acquisitionPrice: value === 'retained' ? undefined : prev.acquisitionPrice,
    }));
  };

  const handleSubmit = async () => {
    setSuccessMessage('');
    setErrorMessage('');

    if (!form.earTag.trim() || !form.name.trim() || !form.birthday) {
      setErrorMessage('耳標番号、名号、生年月日は必須です');
      return;
    }

    if (form.identificationNumber.trim() && !/^\d{10}$/.test(form.identificationNumber.trim())) {
      setErrorMessage('個体識別番号は10桁の数字で入力してください。');
      return;
    }

    try {
      setSaving(true);
      const plan = getFarmProPlan(getCurrentFarmProPlanId());
      const savedCattle = mode === 'create'
        ? await createCattle(form)
        : id
          ? await updateCattle(id, form)
          : null;

      if (!savedCattle) throw new Error('登録・更新対象の牛が見つかりません。');

      if (plan.multiDeviceSync) {
        try {
          await syncCattleRecordToCloud(savedCattle);
          setSuccessMessage(mode === 'create' ? '登録してクラウドへ同期しました' : '更新してクラウドへ同期しました');
        } catch (syncError) {
          console.error(syncError);
          setSuccessMessage(mode === 'create' ? 'この端末には登録しました' : 'この端末のデータは更新しました');
          setErrorMessage(
            syncError instanceof Error
              ? `クラウド同期は完了していません。${syncError.message}`
              : 'クラウド同期は完了していません。時間を置いてもう一度保存してください。',
          );
          return;
        }
      } else {
        setSuccessMessage(mode === 'create' ? '端末内に登録しました' : '端末内のデータを更新しました');
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
    <Stack spacing={1.5}>
      <Typography variant="h5" fontWeight={800}>
        {mode === 'create' ? '牛を新規登録' : '牛を編集'}
      </Typography>
      <Typography color="text.secondary">
        まず基本情報だけ入力して保存できます。詳しい情報は必要なときに開いてください。
      </Typography>

      {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack spacing={1.5}>
            <Grid container spacing={1.25}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="耳標番号"
                  value={form.earTag}
                  onChange={(e) => setValue('earTag', e.target.value)}
                  required
                  size="small"
                  fullWidth
                  helperText="農場内で牛を見分ける番号です（例：9130）"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="個体識別番号"
                  value={form.identificationNumber}
                  onChange={(e) => setValue('identificationNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                  size="small"
                  fullWidth
                  helperText="全国共通の10桁番号です。耳標番号とは別項目です"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="名号"
                  value={form.name}
                  onChange={(e) => setValue('name', e.target.value)}
                  required
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <BirthdayField
                  value={form.birthday}
                  onChange={(value) => setValue('birthday', value)}
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="性別"
                  select
                  value={form.sex}
                  onChange={(e) => setValue('sex', e.target.value)}
                  required
                  size="small"
                  fullWidth
                >
                  <MenuItem value="雌">♀</MenuItem>
                  <MenuItem value="雄">♂</MenuItem>
                  <MenuItem value="去勢">♂去</MenuItem>
                </TextField>
              </Grid>
            </Grid>

            <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
                <Typography fontWeight={700}>詳しい情報を入力</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 1, px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>
                <Stack spacing={1.25} sx={{ maxWidth: 1100 }}>
                  <Grid container spacing={1.25}>
                    <Grid item xs={12} md={4}>
                      <TextField
                        label="取得方法"
                        select
                        value={form.acquisitionMethod ?? ''}
                        onChange={(e) => setAcquisitionMethod(e.target.value as CattleAcquisitionMethod | '')}
                        size="small"
                        fullWidth
                        helperText="この牛が農場に入った方法を選びます。"
                      >
                        <MenuItem value=""><em>未設定</em></MenuItem>
                        <MenuItem value="purchased-calf">子牛で購入</MenuItem>
                        <MenuItem value="purchased-pregnant">妊娠牛で購入</MenuItem>
                        <MenuItem value="retained">自家留保</MenuItem>
                      </TextField>
                    </Grid>
                    {form.acquisitionMethod && (
                      <Grid item xs={12} sm={6} md={4}>
                        <TextField
                          label={form.acquisitionMethod === 'retained' ? '留保日' : '購入日'}
                          type="date"
                          value={form.acquisitionDate ?? ''}
                          onChange={(e) => setValue('acquisitionDate', e.target.value)}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                          fullWidth
                        />
                      </Grid>
                    )}
                    {form.acquisitionMethod && form.acquisitionMethod !== 'retained' && (
                      <Grid item xs={12} sm={6} md={4}>
                        <TextField
                          label="購入金額"
                          type="number"
                          value={form.acquisitionPrice ?? ''}
                          onChange={(e) => setValue('acquisitionPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                          inputProps={{ min: 0, inputMode: 'numeric' }}
                          helperText="税込の購入金額を入力します。"
                          size="small"
                          fullWidth
                        />
                      </Grid>
                    )}
                  </Grid>

                  {form.acquisitionMethod === 'retained' && (
                    <Alert severity="info" sx={{ py: 0.25 }}>
                      自家留保の取得原価は、次の工程で元の子牛の生産費から自動で引き継ぐようにします。
                    </Alert>
                  )}

                  <Grid container spacing={1.25}>
                    <Grid item xs={12} md={6}>
                      <TextField label="父牛" value={form.sire} onChange={(e) => setValue('sire', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField label="母牛" value={form.dam} onChange={(e) => setValue('dam', e.target.value)} size="small" fullWidth />
                    </Grid>
                  </Grid>

                  <Grid container spacing={1.25} alignItems="flex-start">
                    <Grid item xs={12} sm={4} md={3}>
                      <TextField label="産次" type="number" value={form.parity} onChange={(e) => setValue('parity', Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} sm={8} md={9}>
                      <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={2} size="small" fullWidth />
                    </Grid>
                  </Grid>
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
