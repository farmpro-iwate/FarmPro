import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  FeedingAlertActionInput,
  createFeedingAlertAction,
  updateFeedingAlertAction,
  FeedingAlertActionLocalSaveError,
  getFeedingAlertActionSyncContext,
  assertFeedingAlertActionSyncContext
} from '../services/feedingAlertActionsApi';
import { useFeedingFatteningFormAttempt } from './feedingFatteningPageSync';

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const alertTypes = [
  '不足気味',
  '多め',
  '実績なし',
  '生年月日なし',
  '給与目安なし',
  'その他'
];

const actionTypes = [
  '確認のみ',
  '給与量を増やした',
  '給与量を減らした',
  'スターターを調整',
  '育成配合を調整',
  '粗飼料を調整',
  '給与実績を登録',
  '生年月日を確認',
  '目安表を見直し',
  '様子を見る',
  '相談する',
  'その他'
];

const statuses = [
  '未対応',
  '対応中',
  '対応済み',
  '様子見',
  '再確認必要'
];

function safeAlertType(value: string) {
  return alertTypes.includes(value) ? value : 'その他';
}

export function FeedingAlertActionForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialForm = useMemo<FeedingAlertActionInput>(() => {
    const memo = searchParams.get('memo') || '';
    const alertType = safeAlertType(searchParams.get('alertType') || '不足気味');

    return {
      actionDate: today(),
      calfId: searchParams.get('calfId') || '',
      calfName: searchParams.get('calfName') || '',
      ageDays: searchParams.get('ageDays') || '',
      alertType,
      actionType: '確認のみ',
      memo: memo ? `ホーム注意子牛リストから登録：${memo}` : '',
      nextCheckDate: '',
      status: '未対応'
    };
  }, [searchParams]);

  const [form, setForm] = useState<FeedingAlertActionInput>(initialForm);
  const sync = useFeedingFatteningFormAttempt(getFeedingAlertActionSyncContext, assertFeedingAlertActionSyncContext);
  const { saving, locked, error } = sync;

  useEffect(() => { setForm(initialForm); }, [sync.routeKey, initialForm]);

  const fromHome = Boolean(
    searchParams.get('calfName') ||
    searchParams.get('ageDays') ||
    searchParams.get('alertType')
  );

  function update<K extends keyof FeedingAlertActionInput>(key: K, value: FeedingAlertActionInput[K]) {
    if (sync.attemptRef.current?.busy || locked) return;
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const attempt = sync.beginSaving();
    if (!attempt) return;

    try {
      sync.assertAttempt(attempt);
      const saved = attempt.localId === null
        ? await createFeedingAlertAction(form)
        : await updateFeedingAlertAction(attempt.localId, form);
      attempt.localId = saved.id;
      sync.assertAttempt(attempt);
      navigate('/feeding-alert-actions');
    } catch (err) {
      if (err instanceof FeedingAlertActionLocalSaveError) attempt.localId = err.record.id;
      sync.showFailure(attempt, err, '登録に失敗しました。', err instanceof FeedingAlertActionLocalSaveError);
    } finally {
      sync.finishSaving(attempt);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          給与アラート対応記録 新規登録
        </Typography>

        <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
          一覧へ戻る
        </Button>
      </Stack>

      <Alert severity="info">
        不足気味・多め・実績なしなどの給与アラートに対して、確認や調整内容を記録します。
      </Alert>

      {fromHome && (
        <Alert severity="success">
          ホームの注意子牛リストから、子牛耳標番号・日齢・アラート種別を引き継ぎました。
        </Alert>
      )}

      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="対応日"
                  type="date"
                  value={form.actionDate}
                  onChange={(e) => update('actionDate', e.target.value)}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="子牛耳標番号"
                  value={form.calfName}
                  onChange={(e) => update('calfName', e.target.value)}
                  placeholder="例：子牛A"
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="日齢"
                  value={form.ageDays}
                  onChange={(e) => update('ageDays', e.target.value)}
                  placeholder="例：92"
                  fullWidth
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="アラート種別"
                  value={form.alertType}
                  onChange={(e) => update('alertType', e.target.value)}
                  required
                  select
                  fullWidth
                >
                  {alertTypes.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="対応内容"
                  value={form.actionType}
                  onChange={(e) => update('actionType', e.target.value)}
                  required
                  select
                  fullWidth
                >
                  {actionTypes.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="状態"
                  value={form.status}
                  onChange={(e) => update('status', e.target.value)}
                  select
                  fullWidth
                >
                  {statuses.map((item) => (
                    <MenuItem key={item} value={item}>
                      {item}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  disabled={saving || locked}
                  label="次回確認日"
                  type="date"
                  value={form.nextCheckDate}
                  onChange={(e) => update('nextCheckDate', e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  disabled={saving || locked}
                  label="メモ"
                  value={form.memo}
                  onChange={(e) => update('memo', e.target.value)}
                  placeholder="例：スターターを0.5kg増やして3日後に確認"
                  multiline
                  minRows={4}
                  fullWidth
                />
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={saving || locked}>
                {saving ? '登録中...' : '登録する'}
              </Button>

              <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
                キャンセル
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default FeedingAlertActionForm;
