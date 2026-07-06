import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  createFeedingGuide,
  emptyFeedingGuideInput,
  FeedingGuideInput
} from '../services/feedingGuideApi';

function isNumericOrEmpty(valueText: string) {
  if (!valueText) return true;
  return !Number.isNaN(Number(valueText));
}

export function FeedingGuideForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FeedingGuideInput>(emptyFeedingGuideInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField<K extends keyof FeedingGuideInput>(key: K, value: FeedingGuideInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.ageDays.trim()) {
      setError('日齢を入力してください。例：300');
      return;
    }

    if (!isNumericOrEmpty(form.ageDays)) {
      setError('日齢は数字で入力してください。例：300');
      return;
    }

    if (form.ageMonth && !isNumericOrEmpty(form.ageMonth)) {
      setError('月齢は数字で入力してください。例：10');
      return;
    }

    if (!form.stageName.trim()) {
      setError('ステージ名を入力してください。例：育成後期');
      return;
    }

    const numericFields: Array<[keyof FeedingGuideInput, string]> = [
      ['targetWeight', '体重目安'],
      ['targetHeight', '体高目安'],
      ['targetChest', '胸囲目安'],
      ['starterAmount', 'スターター給与量'],
      ['growingFeedAmount', '育成配合給与量'],
      ['roughageAmount', '粗飼料給与量']
    ];

    for (const [key, label] of numericFields) {
      if (!isNumericOrEmpty(form[key])) {
        setError(`${label}は数字で入力してください。`);
        return;
      }
    }

    setSaving(true);

    try {
      await createFeedingGuide(form);
      navigate('/feeding-guide');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料給与目安を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        飼料給与目安 新規登録
      </Typography>

      <Alert severity="info">
        日齢ごとの給与目安を登録します。画像表や農場基準に合わせて数値を入力してください。
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="日齢"
                    placeholder="例：300"
                    value={form.ageDays}
                    onChange={(e) => updateField('ageDays', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    label="月齢"
                    placeholder="例：10"
                    value={form.ageMonth}
                    onChange={(e) => updateField('ageMonth', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="ステージ名"
                    placeholder="例：育成後期、繁殖準備"
                    value={form.stageName}
                    onChange={(e) => updateField('stageName', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="体重目安 kg"
                    placeholder="例：320"
                    value={form.targetWeight}
                    onChange={(e) => updateField('targetWeight', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="体高目安 cm"
                    placeholder="例：120"
                    value={form.targetHeight}
                    onChange={(e) => updateField('targetHeight', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="胸囲目安 cm"
                    placeholder="例：155"
                    value={form.targetChest}
                    onChange={(e) => updateField('targetChest', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="スターター給与量 kg"
                    placeholder="例：3.0"
                    value={form.starterAmount}
                    onChange={(e) => updateField('starterAmount', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="育成配合給与量 kg"
                    placeholder="例：3.0"
                    value={form.growingFeedAmount}
                    onChange={(e) => updateField('growingFeedAmount', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="粗飼料給与量 kg"
                    placeholder="例：4.5"
                    value={form.roughageAmount}
                    onChange={(e) => updateField('roughageAmount', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    label="その他給与量"
                    placeholder="例：初乳、ミルク、添加剤など"
                    value={form.otherAmount}
                    onChange={(e) => updateField('otherAmount', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    label="メモ"
                    placeholder="例：画像表に合わせて調整、農場基準の目安"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '登録中...' : '登録'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/feeding-guide')} disabled={saving}>
                  一覧へ戻る
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Stack>
  );
}
