import { useMemo, useState } from 'react';
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
  Typography
} from '@mui/material';
import { createCalving, type CalvingRecord } from '../services/calvingsApi';

const calfSexOptions = ['メス', 'オス', '不明'];
const calvingResultOptions = ['自然分娩', '難産', '外科的処置', '死産'];
const colostrumStatusOptions = ['未確認', '確認済み', '要確認'];

type SaveDestination = 'list' | 'continue';

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

  if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) {
    return '';
  }

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
    registeredToCalfLedger: false
  };
}

export function CalvingForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<CalvingRecord>(initialForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const daysText = useMemo(
    () => calculateDaysFromExpected(form.actualCalvingDate, form.expectedCalvingDate),
    [form.actualCalvingDate, form.expectedCalvingDate]
  );

  function update<K extends keyof CalvingRecord>(key: K, value: CalvingRecord[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function validate() {
    if (!form.cowName?.trim()) {
      return '母牛名を入力してください。';
    }

    if (!form.actualCalvingDate) {
      return '実分娩日を入力してください。';
    }

    if (!form.calfName?.trim() && form.calvingResult !== '死産') {
      return '子牛耳標番号を入力してください。';
    }

    if (form.birthWeightKg !== '' && form.birthWeightKg !== undefined && Number(form.birthWeightKg) < 0) {
      return '出生体重は0以上で入力してください。';
    }

    return '';
  }

  function buildPayload(): CalvingRecord {
    return {
      ...form,
      birthWeightKg:
        form.birthWeightKg === '' || form.birthWeightKg === undefined || form.birthWeightKg === null
          ? ''
          : Number(form.birthWeightKg),
      registeredToCalfLedger: false
    };
  }

  async function save(destination: SaveDestination) {
    setMessage('');
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      await createCalving(buildPayload());

      if (destination === 'continue') {
        setForm(initialForm());
        setMessage('分娩記録を登録しました。続けて次の分娩記録を入力できます。');
        return;
      }

      setMessage('分娩記録を登録しました。一覧で登録候補だけを表示します。');
      setTimeout(() => navigate('/calvings?registration=ready'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分娩記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save('list');
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
          分娩記録 新規登録
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/calvings?registration=ready" variant="contained" color="warning">
            登録候補を見る
          </Button>
          <Button component={RouterLink} to="/calvings?registration=need-input" variant="outlined" color="warning">
            要確認を見る
          </Button>
          <Button component={RouterLink} to="/calvings" variant="outlined">
            分娩記録一覧へ
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info">
        現場で分かりやすいように、画面では耳標番号を中心に管理します。正式な個体識別番号は必要に応じてメモや台帳側で管理します。
      </Alert>

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
                    placeholder="例：1234"
                    helperText="母牛を耳標番号で識別します。分からなければ空欄でOKです。"
                  />
                </Grid>

                <Grid item xs={12} md={8}>
                  <TextField
                    label="母牛名"
                    fullWidth
                    required
                    value={form.cowName || ''}
                    onChange={(e) => update('cowName', e.target.value)}
                    placeholder="例：はなこ"
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
                    placeholder="例：1234-1"
                    helperText="画面では子牛を耳標番号で識別します。死産の場合は空欄でも登録できます。"
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
                    placeholder="例：32"
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

              <Alert severity="warning">
                子牛台帳へは、分娩記録一覧の「子牛台帳へ登録」ボタンから登録します。「保存して登録候補へ」を押すと、保存後に登録できる記録だけを表示します。
              </Alert>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '登録中...' : '保存して登録候補へ'}
                </Button>
                <Button
                  onClick={() => save('continue')}
                  variant="outlined"
                  disabled={saving}
                >
                  保存して続けて登録
                </Button>
                <Button component={RouterLink} to="/calvings?registration=ready" variant="outlined" color="warning">
                  登録候補を見る
                </Button>
                <Button component={RouterLink} to="/calvings?registration=need-input" variant="outlined" color="warning">
                  要確認を見る
                </Button>
                <Button component={RouterLink} to="/calvings" variant="outlined">
                  分娩記録一覧へ
                </Button>
                <Button component={RouterLink} to="/" variant="outlined">
                  ホームへ
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default CalvingForm;
