import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { CalfInput } from '../types/calf';
import { createCalf, getCalf, updateCalf } from '../services/calfApi';
import { calculateAgeDays, calculateDg, judgeDg } from '../utils/calf';

type Props = { mode: 'create' | 'edit' };
type TextFieldKey = 'calfNumber' | 'name' | 'birthday' | 'sex' | 'motherName' | 'note';
type NumberFieldKey = 'startWeight' | 'currentWeight' | 'elapsedDays' | 'milkAmount' | 'starterAmount';
type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

type CalfApiRecord = Partial<CalfInput> & {
  earTag?: string;
  birthDate?: string;
  birthWeight?: number | string;
  memo?: string;
};

const initialForm: CalfInput = {
  calfNumber: '',
  name: '',
  birthday: '',
  sex: '雌',
  motherName: '',
  startWeight: 0,
  currentWeight: 0,
  elapsedDays: 0,
  milkAmount: 0,
  starterAmount: 0,
  note: ''
};

function textOrEmpty(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function safeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatAmount(value: number, suffix: string) {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function recordToForm(record: CalfApiRecord): CalfInput {
  return {
    calfNumber: textOrEmpty(record.calfNumber || record.earTag),
    name: textOrEmpty(record.name),
    birthday: textOrEmpty(record.birthday || record.birthDate),
    sex: textOrEmpty(record.sex || '雌'),
    motherName: textOrEmpty(record.motherName),
    startWeight: safeNumber(record.startWeight ?? record.birthWeight),
    currentWeight: safeNumber(record.currentWeight),
    elapsedDays: safeNumber(record.elapsedDays),
    milkAmount: safeNumber(record.milkAmount),
    starterAmount: safeNumber(record.starterAmount),
    note: textOrEmpty(record.note || record.memo)
  };
}

function calcAgeDaysOrNull(birthday: string) {
  if (!birthday) return null;
  const ageDays = calculateAgeDays(birthday);
  return Number.isFinite(ageDays) && ageDays >= 0 ? ageDays : null;
}

function calcFormDg(form: CalfInput, ageDays: number | null) {
  const days = form.elapsedDays > 0 ? form.elapsedDays : ageDays ?? 0;
  if (form.startWeight <= 0 || form.currentWeight <= 0 || days <= 0) return null;

  const dg = calculateDg(form.startWeight, form.currentWeight, days);
  return Number.isFinite(dg) ? dg : null;
}

function dgColor(dg: number | null): ChipColor {
  if (dg === null) return 'default';
  const judgement = judgeDg(dg);
  if (judgement === '良') return 'success';
  if (judgement === '注意') return 'warning';
  return 'error';
}

function InfoBox({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        flex: '1 1 150px',
        minWidth: { xs: '100%', sm: 150 },
        p: 1.25
      }}
    >
      <Typography color="text.secondary" variant="caption">{label}</Typography>
      <Typography fontWeight={800}>{value}</Typography>
      {helper && <Typography color="text.secondary" variant="caption">{helper}</Typography>}
    </Box>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box>
      <Typography fontWeight={900} variant="h6">{title}</Typography>
      {subtitle && <Typography color="text.secondary">{subtitle}</Typography>}
    </Box>
  );
}

export function CalfForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<CalfInput>(initialForm);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      if (mode !== 'edit' || !id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const data = await getCalf(id);
        if (active) setForm(recordToForm(data as CalfApiRecord));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : '子牛情報を取得できませんでした。');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [mode, id]);

  const ageDays = useMemo(() => calcAgeDaysOrNull(form.birthday), [form.birthday]);
  const dg = useMemo(() => calcFormDg(form, ageDays), [form, ageDays]);
  const dgDays = form.elapsedDays > 0 ? form.elapsedDays : ageDays;
  const dgJudgement = dg === null ? '未計算' : judgeDg(dg);

  function updateText(key: TextFieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateNumber(key: NumberFieldKey, value: string) {
    setForm((prev) => ({ ...prev, [key]: safeNumber(value) }));
  }

  function validateForm() {
    if (!form.calfNumber.trim() || !form.name.trim() || !form.birthday) {
      return '耳標番号、名号、生年月日は必須です。';
    }

    const numbers = [
      form.startWeight,
      form.currentWeight,
      form.elapsedDays,
      form.milkAmount,
      form.starterAmount
    ];

    if (numbers.some((item) => !Number.isFinite(item) || item < 0)) {
      return '体重・給与量・経過日数は0以上で入力してください。';
    }

    return '';
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (mode === 'create') {
        await createCalf(form);
      } else if (id) {
        await updateCalf(id, form);
      }

      navigate('/calves');
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛情報を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit}>
      <Stack
        alignItems={{ xs: 'stretch', md: 'center' }}
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        spacing={1.5}
      >
        <Box>
          <Typography fontWeight={900} variant="h5">
            {mode === 'create' ? '子牛を新規登録' : '子牛を編集'}
          </Typography>
          <Typography color="text.secondary">
            耳標番号を中心に、基本情報・体重・給与量を登録します。
          </Typography>
        </Box>

        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ</Button>
      </Stack>

      {error && <Alert severity="warning">{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack
              alignItems={{ xs: 'stretch', md: 'center' }}
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              spacing={2}
            >
              <Stack
                alignItems={{ xs: 'stretch', sm: 'center' }}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
              >
                <Box
                  sx={{
                    bgcolor: 'grey.50',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    minWidth: { xs: '100%', sm: 200 },
                    p: 1.5,
                    textAlign: 'center'
                  }}
                >
                  <Typography color="text.secondary" variant="caption">耳標番号</Typography>
                  <Typography fontWeight={900} sx={{ letterSpacing: 0.5 }} variant="h5">
                    {form.calfNumber || '-'}
                  </Typography>
                </Box>

                <Box>
                  <Typography color="text.secondary" variant="caption">名号</Typography>
                  <Typography fontWeight={900} variant="h5">{form.name || '-'}</Typography>
                  <Typography color="text.secondary">母牛：{form.motherName || '-'}</Typography>
                </Box>
              </Stack>

              <Stack alignItems={{ xs: 'flex-start', md: 'flex-end' }} spacing={1}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip label={form.sex || '性別未設定'} size="small" />
                  <Chip label={ageDays === null ? '日齢 -' : `日齢 ${ageDays}日`} size="small" variant="outlined" />
                </Stack>
                <Chip
                  color={dgColor(dg)}
                  label={dg === null ? 'DG未計算' : `DG ${dg.toFixed(2)}kg/日・${dgJudgement}`}
                  sx={{ fontWeight: 700 }}
                  variant={dg === null ? 'outlined' : 'filled'}
                />
              </Stack>
            </Stack>

            <Divider />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <InfoBox label="生年月日" value={form.birthday || '-'} />
              <InfoBox label="DG計算日数" value={dgDays === null ? '-' : `${dgDays}日`} helper={form.elapsedDays > 0 ? '経過日数を使用' : '日齢を使用'} />
              <InfoBox label="開始体重" value={formatAmount(form.startWeight, 'kg')} />
              <InfoBox label="現在体重" value={formatAmount(form.currentWeight, 'kg')} />
              <InfoBox label="ミルク量" value={formatAmount(form.milkAmount, 'L')} />
              <InfoBox label="スターター" value={formatAmount(form.starterAmount, 'kg')} />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <SectionTitle
              title="基本情報"
              subtitle="台帳・カルテで最初に目に入る情報です。"
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="耳標番号"
                onChange={(e) => updateText('calfNumber', e.target.value)}
                placeholder="例：12345"
                required
                value={form.calfNumber}
              />
              <TextField
                fullWidth
                label="名号"
                onChange={(e) => updateText('name', e.target.value)}
                placeholder="例：さくら"
                required
                value={form.name}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                InputLabelProps={{ shrink: true }}
                label="生年月日"
                onChange={(e) => updateText('birthday', e.target.value)}
                required
                type="date"
                value={form.birthday}
              />
              <TextField
                fullWidth
                label="性別"
                onChange={(e) => updateText('sex', e.target.value)}
                select
                value={form.sex}
              >
                <MenuItem value="雌">雌</MenuItem>
                <MenuItem value="雄">雄</MenuItem>
                <MenuItem value="去勢">去勢</MenuItem>
              </TextField>
              <TextField
                fullWidth
                label="母牛名"
                onChange={(e) => updateText('motherName', e.target.value)}
                placeholder="例：母牛A"
                value={form.motherName}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <SectionTitle
              title="体重・DG"
              subtitle="経過日数が0の場合は、生年月日から計算した日齢をDG計算に使います。"
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                inputProps={{ min: 0, step: '0.1' }}
                label="開始体重(kg)"
                onChange={(e) => updateNumber('startWeight', e.target.value)}
                type="number"
                value={form.startWeight}
              />
              <TextField
                fullWidth
                inputProps={{ min: 0, step: '0.1' }}
                label="現在体重(kg)"
                onChange={(e) => updateNumber('currentWeight', e.target.value)}
                type="number"
                value={form.currentWeight}
              />
              <TextField
                fullWidth
                helperText="空欄または0の場合は日齢を使用"
                inputProps={{ min: 0, step: '1' }}
                label="経過日数"
                onChange={(e) => updateNumber('elapsedDays', e.target.value)}
                type="number"
                value={form.elapsedDays}
              />
            </Stack>

            <Alert severity={dg === null ? 'info' : dgColor(dg) === 'success' ? 'success' : dgColor(dg) === 'warning' ? 'warning' : 'error'}>
              {dg === null
                ? '開始体重・現在体重・日数を入力するとDG判定を表示します。'
                : `DGは ${dg.toFixed(2)}kg/日、判定は「${dgJudgement}」です。`}
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <SectionTitle
              title="給与・備考"
              subtitle="ミルク量とスターター給与量は子牛台帳・カルテにも表示されます。"
            />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                inputProps={{ min: 0, step: '0.1' }}
                label="ミルク量(L)"
                onChange={(e) => updateNumber('milkAmount', e.target.value)}
                type="number"
                value={form.milkAmount}
              />
              <TextField
                fullWidth
                inputProps={{ min: 0, step: '0.1' }}
                label="スターター給与量(kg)"
                onChange={(e) => updateNumber('starterAmount', e.target.value)}
                type="number"
                value={form.starterAmount}
              />
            </Stack>

            <TextField
              fullWidth
              label="備考"
              minRows={3}
              multiline
              onChange={(e) => updateText('note', e.target.value)}
              placeholder="例：食いつき、治療メモ、次回確認したいこと"
              value={form.note}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack
            alignItems={{ xs: 'stretch', sm: 'center' }}
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            spacing={1.5}
          >
            <Box>
              <Typography fontWeight={800}>保存前に内容を確認してください。</Typography>
              <Typography color="text.secondary">
                保存後は子牛台帳に戻ります。
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button disabled={saving} size="large" type="submit" variant="contained">
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button component={RouterLink} disabled={saving} size="large" to="/calves" variant="outlined">
                キャンセル
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
