import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { createCalving, type CalvingRecord } from '../services/calvingsApi';
import { getBreedingList } from '../services/breedingApi';
import type { Breeding } from '../types/breeding';

const calfSexOptions = ['メス', 'オス', '不明'];
const calvingResultOptions = ['自然分娩', '難産', '外科的処置', '死産'];
const colostrumStatusOptions = ['未確認', '確認済み', '要確認'];

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

function initialForm(): CalvingRecord {
  return {
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
  const [form, setForm] = useState<CalvingRecord>(initialForm());
  const [breedingRecords, setBreedingRecords] = useState<Breeding[]>([]);
  const [loadingBreedings, setLoadingBreedings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadBreedings() {
      try {
        const records = await getBreedingList();
        setBreedingRecords(records.filter(isPregnantBreeding));
      } catch (err) {
        setError(err instanceof Error ? err.message : '繁殖記録を読み込めませんでした。');
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

  function update<K extends keyof CalvingRecord>(key: K, value: CalvingRecord[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectBreeding(id: string) {
    if (!id) {
      setForm((prev) => ({ ...prev, breedingId: '' }));
      return;
    }
    const record = breedingRecords.find((item) => String(item.id) === id);
    if (!record) return;
    setForm((prev) => ({
      ...prev,
      breedingId: String(record.id),
      cowId: record.cowEarTag,
      cowName: record.cowName,
      expectedCalvingDate: record.expectedCalvingDate,
    }));
  }

  function validate() {
    if (!form.cowName?.trim()) return '母牛名を入力してください。';
    if (!form.actualCalvingDate) return '実分娩日を入力してください。';
    if (!form.calfName?.trim() && form.calvingResult !== '死産') return '子牛耳標番号を入力してください。';
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
      return;
    }
    setSaving(true);
    try {
      const payload: CalvingRecord = {
        ...form,
        birthWeightKg:
          form.birthWeightKg === '' || form.birthWeightKg === undefined || form.birthWeightKg === null
            ? ''
            : Number(form.birthWeightKg),
        registeredToCalfLedger: false,
      };
      await createCalving(payload);
      setMessage(form.breedingId ? '繁殖記録と連携して分娩記録を登録しました。' : '分娩記録を登録しました。');
      setTimeout(() => navigate('/calvings'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>分娩記録 新規登録</Typography>
      <Alert severity="info">
        受胎済みの繁殖記録を選ぶと、母牛耳標番号・母牛名・分娩予定日を自動入力します。該当記録がない場合は、従来どおり手入力できます。
      </Alert>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
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

              <Typography variant="h6" fontWeight={800}>2. 母牛と分娩日</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField label="母牛耳標番号" fullWidth value={form.cowId || ''} onChange={(e) => update('cowId', e.target.value)} placeholder="例：1234" />
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField label="母牛名" fullWidth required value={form.cowName || ''} onChange={(e) => update('cowName', e.target.value)} placeholder="例：はなこ" />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="分娩予定日" type="date" fullWidth InputLabelProps={{ shrink: true }} value={form.expectedCalvingDate || ''} onChange={(e) => update('expectedCalvingDate', e.target.value)} />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="実分娩日" type="date" fullWidth required InputLabelProps={{ shrink: true }} value={form.actualCalvingDate || ''} onChange={(e) => update('actualCalvingDate', e.target.value)} />
                </Grid>
              </Grid>
              {daysText && <Alert severity="info">予定日との差：{daysText}</Alert>}

              <Typography variant="h6" fontWeight={800}>3. 子牛情報</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <TextField label="子牛耳標番号" fullWidth required={form.calvingResult !== '死産'} value={form.calfName || ''} onChange={(e) => update('calfName', e.target.value)} placeholder="例：1234-1" helperText="死産の場合は空欄でも登録できます。" />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField label="性別" select fullWidth value={form.calfSex || '不明'} onChange={(e) => update('calfSex', e.target.value)}>
                    {calfSexOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField label="出生体重" type="number" fullWidth value={form.birthWeightKg ?? ''} onChange={(e) => update('birthWeightKg', e.target.value)} InputProps={{ endAdornment: <Typography color="text.secondary">kg</Typography> }} inputProps={{ min: 0, step: 0.1 }} />
                </Grid>
              </Grid>

              <Typography variant="h6" fontWeight={800}>4. 分娩結果と初乳確認</Typography>
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
                <Button component={RouterLink} to="/calvings" variant="outlined">分娩記録一覧へ</Button>
                <Button component={RouterLink} to="/breedings" variant="outlined">繁殖記録一覧へ</Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default CalvingForm;
