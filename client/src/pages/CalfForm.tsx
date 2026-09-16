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
import { CalfInput } from '../types/calf';
import { createCalf, getCalf, updateCalf } from '../services/calfApi';
import { calculateAgeDays, calculateAgeMonthsAndDays, calculateDg, judgeDg } from '../utils/calf';

type Props = { mode: 'create' | 'edit' };

const initialForm: CalfInput = {
  calfNumber: '', identificationNumber: '', name: '', birthday: '', sex: '雌', motherName: '', sireName: '',
  startWeight: 0, currentWeight: 0, elapsedDays: 0, milkAmount: 0, starterAmount: 0,
  feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
  weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '',
  managementStatus: '育成中', note: ''
};

export function CalfForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CalfInput>(initialForm);
  const [temporaryEarTag, setTemporaryEarTag] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editLoadFailed, setEditLoadFailed] = useState(false);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!id) {
      setErrorMessage('指定された子牛が見つかりません。');
      setEditLoadFailed(true);
      setLoading(false);
      return;
    }

    getCalf(id).then((d) => {
      const calvingId = String(d.calvingId || '');
      const existingNumber = String(d.calfNumber || '');
      const isTemporary = Boolean(
        existingNumber.startsWith('TEMP-') ||
        d.temporaryCalfNumber ||
        (calvingId && (!existingNumber || d.name === '耳標未装着'))
      );
      const internalCalfNumber = isTemporary
        ? (existingNumber.startsWith('TEMP-') ? existingNumber : String(d.temporaryCalfNumber || `TEMP-${calvingId}`))
        : existingNumber;

      setTemporaryEarTag(isTemporary);
      setForm({
        calfNumber: internalCalfNumber,
        identificationNumber: d.identificationNumber || '',
        name: d.name,
        birthday: d.birthday,
        sex: d.sex,
        motherName: d.motherName,
        sireName: d.sireName || '',
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
      });
    })
      .catch((error) => {
        console.error(error);
        setErrorMessage(error instanceof Error ? error.message : '読み込みに失敗しました。');
        setEditLoadFailed(true);
      })
      .finally(() => setLoading(false));
  }, [mode, id]);

  const setValue = (key: keyof CalfInput, value: string | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!form.birthday) {
      setErrorMessage('生年月日は必須です。');
      return;
    }
    if (form.identificationNumber.trim() && !/^\d{10}$/.test(form.identificationNumber.trim())) {
      setErrorMessage('個体識別番号は10桁の数字で入力してください。');
      return;
    }
    if (form.managementStatus === '繁殖候補として留保' && form.sex !== '雌') {
      setErrorMessage('繁殖候補として留保できるのは雌の子牛です。');
      return;
    }

    try {
      setSaving(true);
      if (mode === 'create') {
        await createCalf(form);
        setSuccessMessage('端末内に登録しました。');
      } else if (id) {
        await updateCalf(id, form);
        setSuccessMessage('端末内のデータを更新しました。');
      }
      setTimeout(() => navigate('/calves'), 700);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : '登録・更新に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;
  if (mode === 'edit' && editLoadFailed) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>子牛を編集</Typography>
        <Alert severity="error">{errorMessage || '指定された子牛が見つかりません。'}</Alert>
        <Button component={RouterLink} to="/calves" variant="contained" sx={{ alignSelf: 'flex-start' }}>
          子牛台帳へ戻る
        </Button>
      </Stack>
    );
  }

  const dg = calculateDg(form.startWeight, form.currentWeight, form.elapsedDays);
  const age = calculateAgeMonthsAndDays(form.birthday);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? '子牛を新規登録' : '子牛を編集'}</Typography>
      <Typography color="text.secondary">
        基本情報と成長記録を登録します。哺育・離乳は「哺育・離乳管理」から入力します。
      </Typography>
      {successMessage && <Alert severity="success">{successMessage}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
      <Card><CardContent><Stack spacing={2}>
        <Grid container spacing={1.25} alignItems="flex-start">
          <Grid item xs={12} lg={9}>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="耳標番号"
                  value={temporaryEarTag ? '' : form.calfNumber}
                  onChange={(e) => {
                    const value = e.target.value;
                    setValue('calfNumber', value);
                    if (value.trim()) setTemporaryEarTag(false);
                  }}
                  fullWidth
                  placeholder={temporaryEarTag ? '耳標装着後に入力' : '未装着なら空欄で保存できます'}
                  helperText={temporaryEarTag ? '耳標未装着です。装着後に正式な耳標番号を入力してください' : '未装着の場合は仮管理番号で保存します'}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="個体識別番号"
                  value={form.identificationNumber}
                  onChange={(e) => setValue('identificationNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputProps={{ inputMode: 'numeric', maxLength: 10 }}
                  fullWidth
                  helperText="全国共通の10桁番号です。耳標番号とは別項目です"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="名号"
                  value={form.name}
                  onChange={(e) => setValue('name', e.target.value)}
                  fullWidth
                  helperText="未定なら空欄で保存できます"
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="性別"
                  select
                  value={form.sex}
                  onChange={(e) => setValue('sex', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="雌">♀</MenuItem>
                  <MenuItem value="雄">♂</MenuItem>
                  <MenuItem value="去勢">♂去</MenuItem>
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="飼養区分"
                  select
                  value={form.managementStatus}
                  onChange={(e) => setValue('managementStatus', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="販売予定">販売予定</MenuItem>
                  <MenuItem value="販売済み">販売済み</MenuItem>
                  <MenuItem value="育成中">育成中</MenuItem>
                  <MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem>
                  <MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem>
                  <MenuItem value="死亡・その他">死亡・その他</MenuItem>
                </TextField>
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="母牛名"
                  value={form.motherName}
                  onChange={(e) => setValue('motherName', e.target.value)}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="父牛"
                  value={form.sireName}
                  onChange={(e) => setValue('sireName', e.target.value)}
                  fullWidth
                  helperText="分かる場合に入力してください。産歴にも反映されます"
                />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12} lg={3}>
            <Stack spacing={1}>
              <BirthdayField
                value={form.birthday}
                onChange={(value) => setValue('birthday', value)}
                required
              />
              <Typography color="text.secondary">
                月齢：{age.label}（日齢：{calculateAgeDays(form.birthday)}日）
              </Typography>
            </Stack>
          </Grid>
        </Grid>

        <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography fontWeight={700}>成長記録を入力</Typography></AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="開始体重(kg)"
                  type="number"
                  value={form.startWeight}
                  onChange={(e) => setValue('startWeight', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="現在体重(kg)"
                  type="number"
                  value={form.currentWeight}
                  onChange={(e) => setValue('currentWeight', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  label="経過日数"
                  type="number"
                  value={form.elapsedDays}
                  onChange={(e) => setValue('elapsedDays', Number(e.target.value))}
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex', alignItems: 'center', minHeight: 56 }}>
                <Typography color="text.secondary">DG：{dg.toFixed(2)}kg / 判定：{judgeDg(dg)}</Typography>
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="備考"
                  value={form.note}
                  onChange={(e) => setValue('note', e.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          <Button component={RouterLink} to="/calves" variant="outlined" size="large" disabled={saving}>戻る</Button>
        </Stack>
      </Stack></CardContent></Card>
    </Stack>
  );
}
