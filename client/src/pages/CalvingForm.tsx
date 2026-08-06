import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { createCalving, type CalvingRecord } from '../services/calvingsApi';
import { ensureCalvingMotherCattle } from '../services/motherCattleLink';
import { getBreedingList } from '../services/breedingApi';
import type { Breeding } from '../types/breeding';
import { formatSex } from '../utils/sex';

const calfSexOptions = ['メス', 'オス', '不明'];
const calvingResultOptions = ['自然分娩', '難産', '外科的処置', '死産'];
const colostrumStatusOptions = ['未確認', '確認済み', '要確認'];

type CalvingFormRecord = CalvingRecord & {
  cattleId?: string;
};

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calculateDaysFromExpected(actual?: string, expected?: string) {
  if (!actual || !expected) return '';
  const actualDate = new Date(`${actual}T00:00:00`);
  const expectedDate = new Date(`${expected}T00:00:00`);
  if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) return '';
  const diff = Math.round((actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '予定日どおり';
  if (diff > 0) return `予定日より${diff}日遅れ`;
  return `予定日より${Math.abs(diff)}日早い`;
}

function initialForm(): CalvingFormRecord {
  return {
    cattleId: '',
    cowId: '',
    cowName: '',
    expectedCalvingDate: '',
    actualCalvingDate: today(),
    calfName: '',
    calfSex: '不明',
    birthWeightKg: '',
    calvingResult: '自然分娩',
    colostrumStatus: '未確認',
    memo: '',
    registeredToCalfLedger: false,
    breedingId: '',
  };
}

function isPregnantBreeding(record: Breeding) {
  return ['受胎', '妊娠'].includes(record.pregnancyResult) && record.breedingStatus !== '分娩済み';
}

export function CalvingForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const linkedCattleId = query.get('cattleId') || '';
  const linkedEarTag = query.get('targetNumber') || '';
  const linkedCowName = query.get('targetName') || '';
  const returnTo = query.get('returnTo') || '';
  const openedFromCattle = Boolean(linkedCattleId && linkedEarTag && linkedCowName);

  const [form, setForm] = useState<CalvingFormRecord>(() => ({
    ...initialForm(),
    cattleId: linkedCattleId,
    cowId: linkedEarTag,
    cowName: linkedCowName,
  }));
  const [breedingRecords, setBreedingRecords] = useState<Breeding[]>([]);
  const [loadingBreedings, setLoadingBreedings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resultDialog, setResultDialog] = useState({
    open: false,
    success: false,
    title: '',
    message: '',
    createdId: '',
  });

  useEffect(() => {
    async function loadBreedings() {
      try {
        const records = await getBreedingList();
        setBreedingRecords(records.filter(isPregnantBreeding));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '分娩記録を登録できませんでした。';
        setError(errorMessage);
        setResultDialog({
          open: true,
          success: false,
          title: '登録できませんでした',
          message: errorMessage,
          createdId: '',
        });
      } finally {
        setLoadingBreedings(false);
      }
    }
    loadBreedings();
  }, []);

  const daysText = useMemo(
    () => calculateDaysFromExpected(form.actualCalvingDate, form.expectedCalvingDate),
    [form.actualCalvingDate, form.expectedCalvingDate],
  );

  function update<K extends keyof CalvingFormRecord>(key: K, value: CalvingFormRecord[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateMotherField(key: 'cowId' | 'cowName', value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      cattleId: '',
    }));
  }

  function selectBreeding(id: string) {
    if (!id) {
      setForm((prev) => ({ ...prev, breedingId: '' }));
      return;
    }
    const record = breedingRecords.find((item) => String(item.id) === id);
    if (!record) return;
    const sameLinkedCow = Boolean(linkedCattleId) && record.cowEarTag === linkedEarTag;
    setForm((prev) => ({
      ...prev,
      cattleId: sameLinkedCow ? linkedCattleId : '',
      breedingId: String(record.id),
      cowId: record.cowEarTag,
      cowName: record.cowName,
      expectedCalvingDate: record.expectedCalvingDate,
    }));
  }

  function validate() {
    if (!form.cowName?.trim()) return '母牛名を入力してください。';
    if (!form.actualCalvingDate) return '実分娩日を入力してください。';
    const current = new Date();
    const todayText = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    if (form.actualCalvingDate > todayText) {
      return '実分娩日は今日以前の日付を入力してください。';
    }
    if (form.birthWeightKg !== '' && form.birthWeightKg !== undefined && Number(form.birthWeightKg) < 0) {
      return '出生体重は0以上で入力してください。';
    }
    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setResultDialog({
        open: true,
        success: false,
        title: '入力内容を確認してください',
        message: validationError,
        createdId: '',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: CalvingFormRecord = {
        ...form,
        birthWeightKg:
          form.birthWeightKg === '' || form.birthWeightKg === undefined || form.birthWeightKg === null
            ? ''
            : Number(form.birthWeightKg),
        registeredToCalfLedger: false,
      };
      const createdCalving = await createCalving(payload);
      const linkedCalving = await ensureCalvingMotherCattle(createdCalving);
      setMessage(form.breedingId
        ? '繁殖記録と連携して分娩記録を登録しました。'
        : '分娩記録を登録しました。');
      setResultDialog({
        open: true,
        success: true,
        title: '登録が完了しました',
        message: form.breedingId
          ? '繁殖記録と連携して分娩記録を登録しました。'
          : '分娩記録を登録しました。',
        createdId: String(linkedCalving.id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>分娩記録 新規登録</Typography>
      {form.cattleId && (
        <Alert severity="success">
          個体カルテの母牛を設定しました。耳標番号・母牛名と正式な台帳IDを分娩記録へ連携します。
        </Alert>
      )}
      {!openedFromCattle && (
        <Alert severity="info">
          受胎済みの繁殖記録を選ぶと、母牛耳標番号・母牛名・分娩予定日を自動入力します。該当記録がない場合は、従来どおり手入力できます。
        </Alert>
      )}
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              {!openedFromCattle && (
                <>
                  <Typography variant="h6" fontWeight={800}>1. 繁殖記録との連携</Typography>
                  <TextField
                    label="受胎済み繁殖記録から選ぶ"
                    select
                    fullWidth
                    value={form.breedingId || ''}
                    onChange={(e) => selectBreeding(e.target.value)}
                    disabled={loadingBreedings}
                    helperText={loadingBreedings ? '繁殖記録を読み込み中です。' : '選ばずに手入力することもできます。'}
                  >
                    <MenuItem value="">選択しない（手入力）</MenuItem>
                    {breedingRecords.map((record) => (
                      <MenuItem key={record.id} value={String(record.id)}>
                        {record.cowEarTag}・{record.cowName}　分娩予定日：{record.expectedCalvingDate || '未設定'}
                      </MenuItem>
                    ))}
                  </TextField>
                  {!loadingBreedings && breedingRecords.length === 0 && (
                    <Alert severity="info">受胎済みで、まだ分娩済みになっていない繁殖記録はありません。</Alert>
                  )}
                </>
              )}

              <Typography variant="h6" fontWeight={800}>{openedFromCattle ? '1. 母牛と分娩日' : '2. 母牛と分娩日'}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField label="母牛耳標番号" fullWidth value={form.cowId || ''} onChange={(e) => updateMotherField('cowId', e.target.value)} placeholder="例：1234" />
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField label="母牛名" fullWidth required value={form.cowName || ''} onChange={(e) => updateMotherField('cowName', e.target.value)} placeholder="例：はなこ" />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="分娩予定日" type="date" fullWidth InputLabelProps={{ shrink: true }} value={form.expectedCalvingDate || ''} onChange={(e) => update('expectedCalvingDate', e.target.value)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="実分娩日" type="date" fullWidth required InputLabelProps={{ shrink: true }} value={form.actualCalvingDate || ''} onChange={(e) => update('actualCalvingDate', e.target.value)} />
                </Grid>
              </Grid>
              {daysText && <Alert severity="info">予定日との差：{daysText}</Alert>}

              <Typography variant="h6" fontWeight={800}>{openedFromCattle ? '2. 子牛情報' : '3. 子牛情報'}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <TextField label="子牛耳標番号" fullWidth value={form.calfName || ''} onChange={(e) => update('calfName', e.target.value)} placeholder="例：1234-1" helperText="耳標装着前は空欄のまま登録できます。" />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField label="性別" select fullWidth value={form.calfSex || '不明'} onChange={(e) => update('calfSex', e.target.value)}>
                    {calfSexOptions.map((item) => <MenuItem key={item} value={item}>{formatSex(item)}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField label="出生体重" type="number" fullWidth value={form.birthWeightKg ?? ''} onChange={(e) => update('birthWeightKg', e.target.value)} InputProps={{ endAdornment: <Typography color="text.secondary">kg</Typography> }} inputProps={{ min: 0, step: 0.1 }} />
                </Grid>
              </Grid>

              <Typography variant="h6" fontWeight={800}>{openedFromCattle ? '3. 分娩結果と初乳確認' : '4. 分娩結果と初乳確認'}</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField label="分娩結果" select fullWidth value={form.calvingResult || '自然分娩'} onChange={(e) => update('calvingResult', e.target.value)} helperText="帝王切開などは「外科的処置」にします。">
                    {calvingResultOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="初乳確認" select fullWidth value={form.colostrumStatus || '未確認'} onChange={(e) => update('colostrumStatus', e.target.value)}>
                    {colostrumStatusOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>

              <TextField label="メモ" fullWidth multiline minRows={4} value={form.memo || ''} onChange={(e) => update('memo', e.target.value)} placeholder="自然分娩、初乳確認済み、難産で軽く牽引、獣医対応など" />
              <Alert severity="warning">子牛台帳へは、分娩記録一覧の「子牛台帳へ登録」ボタンから登録します。自動登録ではありません。</Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>{saving ? '登録中...' : '分娩記録を登録'}</Button>
                <Button component={RouterLink} to={returnTo || '/calvings'} variant="outlined">{returnTo ? '個体カルテへ戻る' : '分娩記録一覧へ'}</Button>
                <Button component={RouterLink} to="/breedings" variant="outlined">繁殖記録一覧へ</Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Dialog open={resultDialog.open} maxWidth="sm" fullWidth>
        <DialogTitle>{resultDialog.title}</DialogTitle>
        <DialogContent>
          <Alert severity={resultDialog.success ? 'success' : 'error'} sx={{ mt: 1 }}>
            {resultDialog.message}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => {
              if (resultDialog.success) {
                navigate(returnTo || `/calvings?created=${encodeURIComponent(resultDialog.createdId)}`);
                return;
              }
              setResultDialog((prev) => ({ ...prev, open: false }));
            }}
          >
            {resultDialog.success && returnTo ? '個体カルテへ戻る' : resultDialog.success ? '分娩記録一覧へ' : '入力画面へ戻る'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default CalvingForm;

