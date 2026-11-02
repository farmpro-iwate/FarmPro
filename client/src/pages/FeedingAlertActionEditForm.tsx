import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
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
  fetchFeedingAlertAction,
  updateFeedingAlertAction,
  getFeedingAlertActionSyncContext,
  assertFeedingAlertActionSyncContext
} from '../services/feedingAlertActionsApi';
import { useFeedingFatteningFormAttempt } from './feedingFatteningPageSync';

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

const emptyForm: FeedingAlertActionInput = {
  actionDate: '',
  calfId: '',
  calfName: '',
  ageDays: '',
  alertType: '不足気味',
  actionType: '確認のみ',
  memo: '',
  nextCheckDate: '',
  status: '未対応'
};

export function FeedingAlertActionEditForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<FeedingAlertActionInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const sync = useFeedingFatteningFormAttempt(getFeedingAlertActionSyncContext, assertFeedingAlertActionSyncContext);
  const { saving, locked, error } = sync;

  function update<K extends keyof FeedingAlertActionInput>(key: K, value: FeedingAlertActionInput[K]) {
    if (sync.attemptRef.current?.busy || locked || !ready) return;
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  useEffect(() => {
    const attempt = sync.attemptRef.current;
    if (!attempt) return;
    setLoading(true);
    setReady(false);
    setForm({ ...emptyForm });
    if (!id) {
      sync.setError('対応記録を特定できませんでした。');
      setLoading(false);
      return;
    }
    fetchFeedingAlertAction(id).then(item => {
      sync.assertAttempt(attempt);
      setForm({
        actionDate: item.actionDate || '',
        calfId: item.calfId || '',
        calfName: item.calfName || '',
        ageDays: item.ageDays || '',
        alertType: item.alertType || '不足気味',
        actionType: item.actionType || '確認のみ',
        memo: item.memo || '',
        nextCheckDate: item.nextCheckDate || '',
        status: item.status || '未対応'
      });
      setReady(true);
    }).catch(err => sync.showFailure(attempt, err, '対応記録を取得できませんでした。'))
      .finally(() => { if (sync.isCurrentAttempt(attempt)) setLoading(false); });
  }, [id, sync.routeKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || loading || !ready) return;
    const attempt = sync.beginSaving();
    if (!attempt) return;

    try {
      sync.assertAttempt(attempt);
      await updateFeedingAlertAction(id, form);
      sync.assertAttempt(attempt);
      navigate('/feeding-alert-actions');
    } catch (err) {
      sync.showFailure(attempt, err, '保存に失敗しました。');
    } finally {
      sync.finishSaving(attempt);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          給与アラート対応記録 編集
        </Typography>

        <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
          一覧へ戻る
        </Button>
      </Stack>

      <Alert severity="info">
        対応日、対応内容、状態、次回確認日、メモを更新できます。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && ready && (
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
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    disabled={saving || locked}
                    label="日齢"
                    value={form.ageDays}
                    onChange={(e) => update('ageDays', e.target.value)}
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
                    multiline
                    minRows={4}
                    fullWidth
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving || locked}>
                  {saving ? '保存中...' : '保存する'}
                </Button>

                <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">
                  キャンセル
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export default FeedingAlertActionEditForm;
