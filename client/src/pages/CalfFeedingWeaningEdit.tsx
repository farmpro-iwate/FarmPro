import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
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
import { getCalf, updateCalf } from '../services/calfApi';
import type { CalfInput, FeedingMethod, WeaningStatus } from '../types/calf';

export function CalfFeedingWeaningEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<CalfInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      setError('対象の子牛が見つかりません。');
      setLoading(false);
      return;
    }

    getCalf(id)
      .then((row) => {
        setForm({
          calfNumber: row.calfNumber || '',
          identificationNumber: row.identificationNumber || '',
          name: row.name || '',
          birthday: row.birthday || '',
          sex: row.sex || '雌',
          motherName: row.motherName || '',
          sireName: row.sireName || '',
          startWeight: row.startWeight || 0,
          currentWeight: row.currentWeight || 0,
          elapsedDays: row.elapsedDays || 0,
          milkAmount: row.milkAmount || 0,
          starterAmount: row.starterAmount || 0,
          feedingMethod: row.feedingMethod || '人工哺育',
          weaningPlannedDate: row.weaningPlannedDate || '',
          weaningDate: row.weaningDate || '',
          weaningStatus: row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前'),
          weaningWeight: row.weaningWeight || 0,
          weaningStarterAmount: row.weaningStarterAmount || 0,
          milkEndDate: row.milkEndDate || '',
          managementStatus: row.managementStatus || '育成中',
          note: row.note || '',
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : '子牛情報を読み込めませんでした。'))
      .finally(() => setLoading(false));
  }, [id]);

  function setValue<K extends keyof CalfInput>(key: K, value: CalfInput[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function handleSave() {
    if (!id || !form) return;
    setError('');
    if (form.weaningStatus === '離乳済み' && !form.weaningDate) {
      setError('離乳済みにする場合は、実際の離乳日を入力してください。');
      return;
    }

    setSaving(true);
    try {
      await updateCalf(id, form);
      navigate('/calf-feeding-weaning');
    } catch (err) {
      setError(err instanceof Error ? err.message : '哺育・離乳情報を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!form) return <Alert severity="error">{error || '対象の子牛が見つかりません。'}</Alert>;

  const usesMilk = form.feedingMethod === '人工哺育' || form.feedingMethod === '混合哺育';
  const isWeaned = form.weaningStatus === '離乳済み';

  return (
    <Stack spacing={1.5}>
      <Stack spacing={0.25}>
        <Typography variant="h5" fontWeight={900}>哺育・離乳を入力</Typography>
        <Typography color="text.secondary">
          {form.name || '子牛'} / 耳標 {form.calfNumber?.startsWith('TEMP-') ? '未装着' : form.calfNumber || '-'}
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={4}>
              <TextField
                label="哺育方法"
                select
                value={form.feedingMethod}
                onChange={(e) => setValue('feedingMethod', e.target.value as FeedingMethod)}
                fullWidth
              >
                <MenuItem value="人工哺育">人工哺育（ミルク哺育）</MenuItem>
                <MenuItem value="母乳哺育">自然哺育（母牛から哺乳）</MenuItem>
                <MenuItem value="混合哺育">混合哺育</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="離乳状態"
                select
                value={form.weaningStatus}
                onChange={(e) => {
                  const next = e.target.value as WeaningStatus;
                  setValue('weaningStatus', next);
                  if (next === '離乳前') setValue('weaningDate', '');
                }}
                fullWidth
              >
                <MenuItem value="離乳前">離乳前</MenuItem>
                <MenuItem value="離乳済み">離乳済み</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                label="離乳予定日"
                type="date"
                value={form.weaningPlannedDate}
                onChange={(e) => setValue('weaningPlannedDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>

            {usesMilk && !isWeaned && (
              <Grid item xs={12} md={4}>
                <TextField
                  label="現在のミルク量(L)"
                  type="number"
                  value={form.milkAmount}
                  onChange={(e) => setValue('milkAmount', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
            )}

            {usesMilk && isWeaned && (
              <Grid item xs={12} md={4}>
                <TextField
                  label={form.feedingMethod === '混合哺育' ? '補助ミルク終了日' : 'ミルク終了日'}
                  type="date"
                  value={form.milkEndDate}
                  onChange={(e) => setValue('milkEndDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
            )}

            {isWeaned && (
              <Grid item xs={12} md={4}>
                <TextField
                  label="実際の離乳日"
                  type="date"
                  value={form.weaningDate}
                  onChange={(e) => setValue('weaningDate', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Grid>
            )}

            {isWeaned && (
              <Grid item xs={12} md={4}>
                <TextField
                  label="離乳時体重(kg)"
                  type="number"
                  value={form.weaningWeight}
                  onChange={(e) => setValue('weaningWeight', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
            )}

            {isWeaned && (
              <Grid item xs={12} md={4}>
                <TextField
                  label="離乳時スターター量(kg)"
                  type="number"
                  value={form.weaningStarterAmount}
                  onChange={(e) => setValue('weaningStarterAmount', Number(e.target.value))}
                  fullWidth
                />
              </Grid>
            )}
          </Grid>

          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {form.feedingMethod === '母乳哺育' && (
              <Alert severity="info">自然哺育では、母牛から離した日を「実際の離乳日」として記録します。</Alert>
            )}
            {form.feedingMethod === '混合哺育' && (
              <Alert severity="info">混合哺育では、補助ミルク終了日と最終的な離乳日を分けて記録できます。</Alert>
            )}
            {!isWeaned && usesMilk && (
              <Alert severity="info">「離乳済み」にすると、{form.feedingMethod === '混合哺育' ? '補助ミルク終了日' : 'ミルク終了日'}・実際の離乳日・離乳時体重・離乳時スターター量を入力できます。</Alert>
            )}
            {!isWeaned && !usesMilk && (
              <Alert severity="info">「離乳済み」にすると、実際の離乳日・離乳時体重・離乳時スターター量を入力できます。</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
        <Button component={RouterLink} to="/calf-feeding-weaning" variant="outlined" disabled={saving}>
          戻る
        </Button>
      </Stack>
    </Stack>
  );
}
