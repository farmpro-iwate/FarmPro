import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
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
  Typography
} from '@mui/material';
import {
  fetchBreedingAdvancedRecord,
  updateBreedingAdvancedRecord,
  type BreedingAdvancedRecord
} from '../services/breedingAdvancedApi';

const pregnancyResults = ['未鑑定', '妊娠', '不受胎', '再確認', '流産', '不明'];
const statuses = ['鑑定待ち', '妊娠', '不受胎', '再確認', '流産', '分娩済み', '中止'];

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function statusFromResult(result: string) {
  if (result === '妊娠') return '妊娠';
  if (result === '不受胎') return '不受胎';
  if (result === '再確認') return '再確認';
  if (result === '流産') return '流産';
  if (result === '未鑑定') return '鑑定待ち';
  return '鑑定待ち';
}

function resultHelp(result: string) {
  if (result === '妊娠') {
    return '妊娠確認済みです。今後は分娩予定管理へ進みます。';
  }
  if (result === '不受胎') {
    return '不受胎です。再種付・再移植の検討が必要です。';
  }
  if (result === '再確認') {
    return '再確認が必要です。メモに次回確認予定を書いておくと便利です。';
  }
  if (result === '流産') {
    return '流産として記録します。必要に応じて治療記録やメモを残してください。';
  }
  if (result === '未鑑定') {
    return 'まだ鑑定していない状態です。鑑定予定日の確認対象になります。';
  }
  return '鑑定結果を記録します。';
}

export function PregnancyCheckEdit() {
  const params = useParams();
  const id = params.id || '';
  const navigate = useNavigate();

  const [record, setRecord] = useState<BreedingAdvancedRecord | null>(null);
  const [form, setForm] = useState<BreedingAdvancedRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (!id) {
      setError('対象の繁殖記録IDがありません。');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await fetchBreedingAdvancedRecord(id);
      setRecord(data);
      setForm({
        ...data,
        pregnancyResult: data.pregnancyResult || '未鑑定',
        status: data.status || statusFromResult(data.pregnancyResult || '未鑑定'),
        pregnancyCheckActualDate: data.pregnancyCheckActualDate || ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '妊娠鑑定記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const selectedResult = form?.pregnancyResult || '未鑑定';

  const help = useMemo(() => resultHelp(selectedResult), [selectedResult]);

  function update<K extends keyof BreedingAdvancedRecord>(key: K, value: BreedingAdvancedRecord[K]) {
    setForm((prev) => {
      if (!prev) return prev;

      const next = {
        ...prev,
        [key]: value
      };

      if (key === 'pregnancyResult') {
        next.status = statusFromResult(String(value || '未鑑定'));
        if (value && value !== '未鑑定' && !next.pregnancyCheckActualDate) {
          next.pregnancyCheckActualDate = today();
        }
      }

      return next;
    });
  }

  async function quickResult(result: string) {
    if (!form) return;
    setForm({
      ...form,
      pregnancyResult: result,
      status: statusFromResult(result),
      pregnancyCheckActualDate: form.pregnancyCheckActualDate || today()
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !id) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      await updateBreedingAdvancedRecord(id, form);
      setMessage('妊娠鑑定結果を更新しました。');
      setTimeout(() => navigate('/pregnancy-checks'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Typography>妊娠鑑定記録を読み込み中...</Typography>;
  }

  if (error && !form) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{error}</Alert>
        <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">
          妊娠鑑定一覧へ戻る
        </Button>
      </Stack>
    );
  }

  if (!form) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">妊娠鑑定記録が見つかりません。</Alert>
        <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">
          妊娠鑑定一覧へ戻る
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        妊娠鑑定 結果更新
      </Typography>

      <Alert severity="info">
        妊娠鑑定結果を更新する専用画面です。既存の繁殖画面は変更していません。
      </Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>
              対象記録
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">母牛・受卵牛</Typography>
                <Typography fontWeight={800}>{value(record?.cowName)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">繁殖区分</Typography>
                <Typography fontWeight={800}>{value(record?.breedingType)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">実施日</Typography>
                <Typography fontWeight={800}>{value(record?.serviceDate)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">妊娠鑑定予定日</Typography>
                <Typography fontWeight={800}>{value(record?.pregnancyCheckDate)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">分娩予定日</Typography>
                <Typography fontWeight={800}>{value(record?.expectedCalvingDate)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography color="text.secondary">種雄牛</Typography>
                <Typography fontWeight={800}>{value(record?.sireName)}</Typography>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={800}>
                鑑定結果
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant={selectedResult === '妊娠' ? 'contained' : 'outlined'} onClick={() => quickResult('妊娠')}>
                  妊娠
                </Button>
                <Button variant={selectedResult === '不受胎' ? 'contained' : 'outlined'} onClick={() => quickResult('不受胎')}>
                  不受胎
                </Button>
                <Button variant={selectedResult === '再確認' ? 'contained' : 'outlined'} onClick={() => quickResult('再確認')}>
                  再確認
                </Button>
                <Button variant={selectedResult === '流産' ? 'contained' : 'outlined'} onClick={() => quickResult('流産')}>
                  流産
                </Button>
              </Stack>

              <Alert severity="info">{help}</Alert>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="妊娠鑑定実施日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.pregnancyCheckActualDate || ''}
                    onChange={(e) => update('pregnancyCheckActualDate', e.target.value)}
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="妊娠鑑定結果"
                    select
                    fullWidth
                    value={form.pregnancyResult || '未鑑定'}
                    onChange={(e) => update('pregnancyResult', e.target.value)}
                  >
                    {pregnancyResults.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="状態"
                    select
                    fullWidth
                    value={form.status || '鑑定待ち'}
                    onChange={(e) => update('status', e.target.value)}
                  >
                    {statuses.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>

              <TextField
                label="メモ"
                fullWidth
                multiline
                minRows={4}
                value={form.memo || ''}
                onChange={(e) => update('memo', e.target.value)}
                placeholder="例：妊娠確認済み。分娩予定管理へ。 / 不受胎。再種付検討。 / 10日後に再確認。"
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '更新中...' : '鑑定結果を更新'}
                </Button>
                <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">
                  妊娠鑑定一覧へ戻る
                </Button>
                <Button component={RouterLink} to="/breedings-advanced" variant="outlined">
                  繁殖強化一覧へ戻る
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default PregnancyCheckEdit;
