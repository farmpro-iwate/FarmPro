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
  Typography,
} from '@mui/material';
import { getBreeding, updateBreeding } from '../services/breedingApi';
import type { Breeding, BreedingInput } from '../types/breeding';

const pregnancyResults = ['未鑑定', '受胎', '空胎', '再鑑定予定', '流産・胎子喪失', '不明'];

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

function breedingType(row: Breeding) {
  if (row.breedingMethod === '種付') return '種付';
  if (row.breedingMethod === '受精卵移植') return '受精卵移植';
  return row.breedingMethod || '-';
}

function serviceDate(row: Breeding) {
  if (row.breedingMethod === '受精卵移植') return row.transferDate || row.transferPlannedDate || '';
  return row.inseminationDate || row.heatDate || '';
}

function sireName(row: Breeding) {
  return row.breedingMethod === '受精卵移植' ? row.embryoSireName : row.bullName;
}

function resultHelp(result: string) {
  if (result === '受胎') return '受胎を確認した記録として保存します。今後は分娩予定管理へつなげます。';
  if (result === '空胎') return '空胎として記録します。必要に応じて再種付・再移植を検討します。';
  if (result === '再鑑定予定') return '再鑑定が必要な状態として記録します。';
  if (result === '流産・胎子喪失') return '流産・胎子喪失として記録します。必要に応じて治療記録やメモを残してください。';
  if (result === '未鑑定') return 'まだ鑑定していない状態です。妊娠鑑定予定日の確認対象になります。';
  return '妊娠鑑定結果を記録します。';
}

function toInput(record: Breeding): BreedingInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = record;
  return input;
}

export function PregnancyCheckEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Breeding | null>(null);
  const [form, setForm] = useState<BreedingInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('対象の繁殖記録IDがありません。');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const data = await getBreeding(id);
        setRecord(data);
        setForm(toInput(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : '妊娠鑑定記録を取得できませんでした。');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  const selectedResult = form?.pregnancyResult || '未鑑定';
  const help = useMemo(() => resultHelp(selectedResult), [selectedResult]);
  const hasPregnancyCheck = Boolean(
    form?.pregnancyCheckExpectedDate ||
    form?.pregnancyCheckDate ||
    (form?.pregnancyResult && form.pregnancyResult !== '未鑑定') ||
    form?.recheckExpectedDate
  );

  function update<K extends keyof BreedingInput>(key: K, nextValue: BreedingInput[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: nextValue } : prev));
  }

  function quickResult(result: string) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pregnancyResult: result,
        pregnancyCheckDate: result === '未鑑定' ? prev.pregnancyCheckDate : (prev.pregnancyCheckDate || today()),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !id) return;

    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateBreeding(id, form);
      setMessage('妊娠鑑定を更新しました。');
      setTimeout(() => navigate('/pregnancy-checks'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPregnancyCheck() {
    if (!form || !id) return;
    if (!window.confirm('この妊娠鑑定を取消しますか？\n種付・移植など元の繁殖記録は残ります。')) return;

    const cancelled: BreedingInput = {
      ...form,
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
    };

    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateBreeding(id, cancelled);
      setForm(cancelled);
      setMessage('妊娠鑑定を取消しました。種付・移植の記録は残っています。');
      setTimeout(() => navigate('/pregnancy-checks'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '妊娠鑑定を取消できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Typography>妊娠鑑定記録を読み込み中...</Typography>;

  if (error && !form) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{error}</Alert>
        <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">妊娠鑑定一覧へ戻る</Button>
      </Stack>
    );
  }

  if (!form || !record) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">妊娠鑑定記録が見つかりません。</Alert>
        <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">妊娠鑑定一覧へ戻る</Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>妊娠鑑定を編集</Typography>
      <Alert severity="info">妊娠鑑定は後から修正・取消できます。取消しても、元の種付・移植記録は残ります。</Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>対象記録</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}><Typography color="text.secondary">母牛・受卵牛</Typography><Typography fontWeight={800}>{value(record.cowEarTag)} {value(record.cowName)}</Typography></Grid>
              <Grid item xs={12} md={4}><Typography color="text.secondary">繁殖区分</Typography><Typography fontWeight={800}>{breedingType(record)}</Typography></Grid>
              <Grid item xs={12} md={4}><Typography color="text.secondary">実施日</Typography><Typography fontWeight={800}>{value(serviceDate(record))}</Typography></Grid>
              <Grid item xs={12} md={4}><Typography color="text.secondary">妊娠鑑定予定日</Typography><Typography fontWeight={800}>{value(form.pregnancyCheckExpectedDate)}</Typography></Grid>
              <Grid item xs={12} md={4}><Typography color="text.secondary">分娩予定日</Typography><Typography fontWeight={800}>{value(record.expectedCalvingDate)}</Typography></Grid>
              <Grid item xs={12} md={4}><Typography color="text.secondary">種雄牛</Typography><Typography fontWeight={800}>{value(sireName(record))}</Typography></Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={800}>鑑定結果</Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant={selectedResult === '受胎' ? 'contained' : 'outlined'} onClick={() => quickResult('受胎')}>受胎</Button>
                <Button variant={selectedResult === '空胎' ? 'contained' : 'outlined'} onClick={() => quickResult('空胎')}>空胎</Button>
                <Button variant={selectedResult === '再鑑定予定' ? 'contained' : 'outlined'} onClick={() => quickResult('再鑑定予定')}>再鑑定予定</Button>
                <Button variant={selectedResult === '流産・胎子喪失' ? 'contained' : 'outlined'} onClick={() => quickResult('流産・胎子喪失')}>流産・胎子喪失</Button>
              </Stack>

              <Alert severity="info">{help}</Alert>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="妊娠鑑定実施日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.pregnancyCheckDate || ''}
                    onChange={(e) => update('pregnancyCheckDate', e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="妊娠鑑定結果"
                    select
                    fullWidth
                    value={selectedResult}
                    onChange={(e) => update('pregnancyResult', e.target.value)}
                  >
                    {pregnancyResults.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>

              {selectedResult === '再鑑定予定' && (
                <TextField
                  label="再鑑定予定日"
                  type="date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.recheckExpectedDate || ''}
                  onChange={(e) => update('recheckExpectedDate', e.target.value)}
                />
              )}

              <TextField
                label="メモ"
                fullWidth
                multiline
                minRows={4}
                value={form.note || ''}
                onChange={(e) => update('note', e.target.value)}
                placeholder="例：受胎確認済み。 / 空胎。再種付検討。 / 10日後に再鑑定。"
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>{saving ? '更新中...' : '変更を保存'}</Button>
                {hasPregnancyCheck && <Button color="error" variant="outlined" onClick={handleCancelPregnancyCheck} disabled={saving}>妊娠鑑定を取消</Button>}
                <Button component={RouterLink} to="/pregnancy-checks" variant="outlined">妊娠鑑定一覧へ戻る</Button>
                <Button component={RouterLink} to="/breedings" variant="outlined">繁殖管理へ戻る</Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default PregnancyCheckEdit;
