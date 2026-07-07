import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
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
  fetchCalving,
  updateCalving,
  type CalvingRecord
} from '../services/calvingsApi';

const calfSexOptions = ['メス', 'オス', '不明'];
const calvingResultOptions = ['自然分娩', '難産', '外科的処置', '死産'];
const colostrumStatusOptions = ['未確認', '確認済み', '要確認'];

function calculateDaysFromExpected(actual?: string, expected?: string) {
  if (!actual || !expected) return '';

  const actualDate = new Date(`${actual}T00:00:00`);
  const expectedDate = new Date(`${expected}T00:00:00`);

  if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) {
    return '';
  }

  const diff = Math.round((actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return '予定日どおり';
  if (diff > 0) return `予定日より${diff}日遅れ`;
  return `予定日より${Math.abs(diff)}日早い`;
}

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function calfDetailPath(form: CalvingRecord) {
  return form.calfId ? `/calves/${form.calfId}` : '/calves';
}

function calfDetailButtonText(form: CalvingRecord) {
  return form.calfId ? '子牛カルテを確認' : '子牛台帳を確認';
}

function calfLinkStatusText(form: CalvingRecord) {
  if (!form.registeredToCalfLedger) return '未登録';
  if (form.calfId) return '登録済み：子牛カルテへ直接移動できます。';
  return '登録済み：直接リンク情報がないため、子牛台帳一覧から確認します。';
}

export function CalvingEditForm() {
  const params = useParams();
  const id = params.id || '';
  const navigate = useNavigate();

  const [form, setForm] = useState<CalvingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const daysText = useMemo(
    () => calculateDaysFromExpected(form?.actualCalvingDate, form?.expectedCalvingDate),
    [form?.actualCalvingDate, form?.expectedCalvingDate]
  );

  async function load() {
    if (!id) {
      setError('分娩記録を特定できません。一覧から開き直してください。');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await fetchCalving(id);
      setForm({
        ...data,
        calfSex: data.calfSex || '不明',
        calvingResult: data.calvingResult || '自然分娩',
        colostrumStatus: data.colostrumStatus || '未確認'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function update<K extends keyof CalvingRecord>(key: K, newValue: CalvingRecord[K]) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: newValue
      };
    });
  }

  function validate() {
    if (!form?.cowName?.trim()) {
      return '母牛名を入力してください。';
    }

    if (!form?.actualCalvingDate) {
      return '実分娩日を入力してください。';
    }

    if (!form?.calfName?.trim() && form?.calvingResult !== '死産') {
      return '子牛耳標番号を入力してください。';
    }

    if (form.birthWeightKg !== '' && form.birthWeightKg !== undefined && Number(form.birthWeightKg) < 0) {
      return '出生体重は0以上で入力してください。';
    }

    return '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form || !id) return;

    setMessage('');
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (form.registeredToCalfLedger) {
      const ok = window.confirm(
        'この分娩記録はすでに子牛台帳へ登録済みです。\n分娩記録だけを変更しても、子牛台帳側は自動では変わりません。\nこのまま更新しますか？'
      );

      if (!ok) return;
    }

    setSaving(true);

    try {
      const payload: CalvingRecord = {
        ...form,
        birthWeightKg:
          form.birthWeightKg === '' || form.birthWeightKg === undefined || form.birthWeightKg === null
            ? ''
            : Number(form.birthWeightKg)
      };

      await updateCalving(id, payload);
      setMessage('分娩記録を更新しました。');
      setTimeout(() => navigate('/calvings'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を更新できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Typography>分娩記録を読み込み中...</Typography>;
  }

  if (error && !form) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{error}</Alert>
        <Button component={RouterLink} to="/calvings" variant="outlined">
          分娩記録一覧へ戻る
        </Button>
      </Stack>
    );
  }

  if (!form) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">分娩記録が見つかりません。</Alert>
        <Button component={RouterLink} to="/calvings" variant="outlined">
          分娩記録一覧へ戻る
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        alignItems={{ xs: 'stretch', sm: 'center' }}
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        spacing={1}
      >
        <Typography variant="h5" fontWeight={800}>
          分娩記録 編集
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/calvings" variant="outlined">
            分娩記録一覧へ
          </Button>
          {form.registeredToCalfLedger && (
            <Button component={RouterLink} to={calfDetailPath(form)} variant="contained" color="success">
              {calfDetailButtonText(form)}
            </Button>
          )}
        </Stack>
      </Stack>

      {form.registeredToCalfLedger ? (
        <Alert severity="warning">
          この分娩記録はすでに子牛台帳へ登録済みです。ここで修正しても、子牛台帳側の内容は自動更新されません。
          {form.calfId ? ' 子牛カルテは上のボタンから確認できます。' : ' 直接リンク情報がないため、子牛台帳一覧から確認してください。'}
        </Alert>
      ) : (
        <Alert severity="info">
          分娩記録を修正できます。画面では耳標番号を中心に識別します。
        </Alert>
      )}

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography variant="h6" fontWeight={800}>
                1. 母牛と分娩日
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="母牛耳標番号"
                    fullWidth
                    value={form.cowId || ''}
                    onChange={(e) => update('cowId', e.target.value)}
                    helperText="母牛を耳標番号で識別します。"
                  />
                </Grid>

                <Grid item xs={12} md={8}>
                  <TextField
                    label="母牛名"
                    fullWidth
                    required
                    value={form.cowName || ''}
                    onChange={(e) => update('cowName', e.target.value)}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="分娩予定日"
                    type="date"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.expectedCalvingDate || ''}
                    onChange={(e) => update('expectedCalvingDate', e.target.value)}
                    helperText="分からなければ空欄でOKです。"
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="実分娩日"
                    type="date"
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                    value={form.actualCalvingDate || ''}
                    onChange={(e) => update('actualCalvingDate', e.target.value)}
                  />
                </Grid>
              </Grid>

              {daysText && <Alert severity="info">予定日との差：{daysText}</Alert>}

              <Typography variant="h6" fontWeight={800}>
                2. 子牛情報
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={5}>
                  <TextField
                    label="子牛耳標番号"
                    fullWidth
                    required={form.calvingResult !== '死産'}
                    value={form.calfName || ''}
                    onChange={(e) => update('calfName', e.target.value)}
                    helperText="画面では子牛を耳標番号で識別します。"
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    label="性別"
                    select
                    fullWidth
                    value={form.calfSex || '不明'}
                    onChange={(e) => update('calfSex', e.target.value)}
                  >
                    {calfSexOptions.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="出生体重"
                    type="number"
                    fullWidth
                    value={form.birthWeightKg ?? ''}
                    onChange={(e) => update('birthWeightKg', e.target.value)}
                    InputProps={{
                      endAdornment: <Typography color="text.secondary">kg</Typography>
                    }}
                    inputProps={{ min: 0, step: 0.1 }}
                    helperText="あとで分かる場合は空欄でOKです。"
                  />
                </Grid>
              </Grid>

              <Typography variant="h6" fontWeight={800}>
                3. 分娩結果と初乳確認
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="分娩結果"
                    select
                    fullWidth
                    value={form.calvingResult || '自然分娩'}
                    onChange={(e) => update('calvingResult', e.target.value)}
                    helperText="帝王切開などは「外科的処置」にします。"
                  >
                    {calvingResultOptions.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="初乳確認"
                    select
                    fullWidth
                    value={form.colostrumStatus || '未確認'}
                    onChange={(e) => update('colostrumStatus', e.target.value)}
                    helperText="確認できたら「確認済み」にします。気になる場合は「要確認」です。"
                  >
                    {colostrumStatusOptions.map((item) => (
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
                placeholder="例：個体識別番号、自然分娩、初乳確認済み、難産で軽く牽引、外科的処置で獣医対応など"
                helperText="正式な個体識別番号や補足情報はメモに残せます。"
              />

              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography fontWeight={800}>子牛台帳登録状況</Typography>
                    <Typography>
                      {calfLinkStatusText(form)}
                    </Typography>
                    {form.registeredToCalfLedger && (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button component={RouterLink} to={calfDetailPath(form)} variant="contained" color="success">
                          {calfDetailButtonText(form)}
                        </Button>
                        {!form.calfId && (
                          <Typography color="text.secondary" variant="body2">
                            直接リンク情報がない登録済み記録のため、子牛台帳一覧へ移動します。
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '更新中...' : '分娩記録を更新'}
                </Button>
                <Button component={RouterLink} to="/calvings" variant="outlined">
                  分娩記録一覧へ戻る
                </Button>
                {form.registeredToCalfLedger && (
                  <Button component={RouterLink} to={calfDetailPath(form)} variant="outlined" color="success">
                    {calfDetailButtonText(form)}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default CalvingEditForm;
