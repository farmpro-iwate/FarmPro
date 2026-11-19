import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { getCalf, updateCalfFeedingWeaning } from '../services/calfApi';
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
          motherSeparationDate: row.motherSeparationDate || '',
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
    if (form.motherSeparationDate && form.weaningDate && form.weaningStatus === '離乳済み' &&
        form.weaningDate < form.motherSeparationDate) {
      setError('離乳日は母牛からの分離日以降にしてください。');
      return;
    }
    if (form.milkEndDate && form.motherSeparationDate && form.milkEndDate < form.motherSeparationDate) {
      setError('ミルク終了日は母牛からの分離日以降にしてください。');
      return;
    }

    setSaving(true);
    try {
      await updateCalfFeedingWeaning(id, {
        feedingMethod: form.feedingMethod,
        weaningStatus: form.weaningStatus,
        weaningDate: form.weaningStatus === '離乳前' ? '' : form.weaningDate,
        weaningWeight: form.weaningWeight,
        weaningStarterAmount: form.weaningStarterAmount,
        milkAmount: form.milkAmount,
        starterAmount: form.starterAmount,
        milkEndDate: form.milkEndDate,
        motherSeparationDate: form.motherSeparationDate,
      });
      navigate(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '哺育・離乳情報を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!form) return <Alert severity="error">{error || '対象の子牛が見つかりません。'}</Alert>;

  const usesMilk = form.feedingMethod === '人工哺育' || form.feedingMethod === '混合哺育';
  const isMixed = form.feedingMethod === '混合哺育';
  const isWeaned = form.weaningStatus === '離乳済み';
  const guideAlertSx = {
    py: { xs: 0.35, sm: 0.75 },
    px: { xs: 1, sm: 2 },
    alignItems: 'center',
    '& .MuiAlert-icon': {
      py: 0,
      mr: { xs: 1, sm: 1.5 },
    },
    '& .MuiAlert-message': {
      py: 0,
      fontSize: { xs: '0.92rem', sm: '1rem' },
      lineHeight: { xs: 1.55, sm: 1.6 },
    },
  } as const;

  return (
    <Stack spacing={1.5}>
      <Stack spacing={0.25}>
        <Typography variant="h5" fontWeight={900}>
          {isWeaned ? '離乳記録を確認・修正' : '哺育・離乳を入力'}
        </Typography>
        <Typography color="text.secondary">
          {form.name || '子牛'} / 耳標 {form.calfNumber?.startsWith('TEMP-') ? '未装着' : form.calfNumber || '-'}
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}>
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

            <Grid item xs={12} md={6}>
              <TextField
                label="離乳状態"
                select
                value={form.weaningStatus}
                onChange={(e) => setValue('weaningStatus', e.target.value as WeaningStatus)}
                fullWidth
              >
                <MenuItem value="離乳前">離乳前</MenuItem>
                <MenuItem value="離乳済み">離乳済み</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                label="母牛から離した日（任意）"
                type="date"
                value={form.motherSeparationDate || ''}
                onChange={(e) => setValue('motherSeparationDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>

            {form.motherSeparationDate && form.feedingMethod === '母乳哺育' && !isWeaned && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  母牛から離してミルクを与え始めた場合は、哺育方法を「人工哺育」に切り替えてください。
                  この時点ではまだ「離乳前」です。
                </Alert>
              </Grid>
            )}

            {usesMilk && !isWeaned && (
              <Grid item xs={12} md={6}>
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
              <Grid item xs={12} md={6}>
                <TextField
                  label={isMixed ? '補助ミルク終了日' : '人工哺育のミルク終了日'}
                  type="date"
                  value={form.milkEndDate}
                  onChange={(e) => {
                    const milkEndDate = e.target.value;
                    setForm((previous) => previous ? {
                      ...previous,
                      milkEndDate,
                      // Suggest the same date only if the user has not entered
                      // an actual weaning date. Never overwrite a manual date.
                      weaningDate: milkEndDate && !previous.weaningDate
                        ? milkEndDate : previous.weaningDate,
                    } : previous);
                  }}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
            )}

            {isWeaned && (
              <Grid item xs={12} md={6}>
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
              <Grid item xs={12} md={6}>
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
              <Grid item xs={12} md={6}>
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

          <Stack spacing={0.75} sx={{ mt: 1.25 }}>
            {form.feedingMethod === '人工哺育' && isWeaned && (
              <Alert severity="info" sx={guideAlertSx}>人工哺育では、ミルクを終了した日と「実際の離乳日」を記録します。母牛からの分離日がある場合も別々に残ります。</Alert>
            )}
            {form.feedingMethod === '母乳哺育' && (
              <Alert severity="info" sx={guideAlertSx}>自然哺育のみで終了する場合は、母牛から離した日を「実際の離乳日」として記録します。人工哺育に切り替える場合は、母牛から離した日を別に記録し、「離乳前」のままにします。</Alert>
            )}
            {isMixed && (
              <Alert severity="info" sx={guideAlertSx}>混合哺育では、補助ミルク終了日と最終的な離乳日を分けて記録できます。</Alert>
            )}
            {!isWeaned && isMixed && (
              <Alert severity="info" sx={guideAlertSx}>「離乳済み」にすると、補助ミルク終了日・実際の離乳日・離乳時体重・離乳時スターター量を入力できます。</Alert>
            )}
            {!isWeaned && !isMixed && (
              <Alert severity="info" sx={guideAlertSx}>「離乳済み」にすると、実際の離乳日・離乳時体重・離乳時スターター量を入力できます。人工哺育ではミルク終了日も記録できます。</Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : isWeaned ? '修正を保存' : '保存'}
        </Button>
        <Button variant="outlined" disabled={saving} onClick={() => navigate(-1)}>
          戻る
        </Button>
      </Stack>
    </Stack>
  );
}
