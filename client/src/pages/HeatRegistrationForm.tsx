import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CattlePicker } from '../components/CattlePicker';
import { createBreeding } from '../services/breedingApi';
import { getFarmSettings } from '../services/settingsApi';
import { calculateNextHeatExpectedDate } from '../utils/breeding';
import type { BreedingInput } from '../types/breeding';

const initialForm: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
  estrusType: '',
  breedingMethod: '未選択',
  breedingStatus: '発情予定',
  inseminationDate: '',
  bullName: '',
  bullMasterId: undefined,
  inseminatorName: '',
  inseminatorMasterId: undefined,
  transferPlannedDate: '',
  transferDate: '',
  transferCancelReason: '',
  embryoNumber: '',
  collectionDate: '',
  embryoType: '未選択',
  donorCowName: '',
  donorCowEarTag: '',
  embryoSireName: '',
  embryoSireMasterId: undefined,
  embryoGrade: '',
  strawNumber: '',
  supplierName: '',
  supplierMasterId: undefined,
  transferTechnician: '',
  transferTechnicianMasterId: undefined,
  nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '',
  estrusSigns: [],
  estrusSignsOther: '',
  note: '',
};

type BreedingDecision = '' | 'inseminate' | 'wait';

export function HeatRegistrationForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetNumber = searchParams.get('targetNumber') || '';
  const targetName = searchParams.get('targetName') || '';
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/cattle/') ? requestedReturnTo : '/breedings';
  const openedFromCattle = Boolean(targetNumber && targetName);

  const [form, setForm] = useState<BreedingInput>(() => ({
    ...initialForm,
    cowEarTag: targetNumber,
    cowName: targetName,
  }));
  const [saving, setSaving] = useState(false);
  const [cycleDays, setCycleDays] = useState(21);
  const [decision, setDecision] = useState<BreedingDecision>('');

  useEffect(() => {
    getFarmSettings()
      .then((settings) => setCycleDays(settings.estrousCycleDays || 21))
      .catch(() => setCycleDays(21));
  }, []);

  useEffect(() => {
    if (decision !== 'wait' || !form.heatDate) return;
    setForm((prev) => ({
      ...prev,
      nextHeatExpectedDate: calculateNextHeatExpectedDate(prev.heatDate, cycleDays),
    }));
  }, [decision, form.heatDate, cycleDays]);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateBase = () => {
    const cowEarTag = openedFromCattle ? targetNumber : form.cowEarTag;
    const cowName = openedFromCattle ? targetName : form.cowName;
    if (!cowEarTag || !cowName) {
      alert('対象牛を選択してください');
      return null;
    }
    if (!form.heatDate) {
      alert('発情日を入力してください');
      return null;
    }
    if (!form.estrusType) {
      alert('発情区分を選択してください');
      return null;
    }
    return { cowEarTag, cowName };
  };

  const saveAndFinish = async () => {
    const target = validateBase();
    if (!target) return;
    if (!decision) return alert('種付の判断を選択してください');
    if (decision === 'wait' && !form.nextHeatExpectedDate) return alert('次回発情予定日を入力してください');

    setSaving(true);
    try {
      const created = await createBreeding({
        ...form,
        ...target,
        breedingMethod: '未選択',
        breedingStatus: '発情確認',
        nextHeatExpectedDate: decision === 'wait' ? form.nextHeatExpectedDate : '',
      });

      if (decision === 'inseminate') {
        const params = new URLSearchParams({ returnTo });
        navigate(`/breedings/${created.id}/insemination?${params.toString()}`);
        return;
      }

      navigate(returnTo);
    } finally {
      setSaving(false);
    }
  };

  const saveAndGoToTransfer = async () => {
    const target = validateBase();
    if (!target) return;
    setSaving(true);
    try {
      const created = await createBreeding({
        ...form,
        ...target,
        breedingMethod: '未選択',
        breedingStatus: '発情確認',
      });
      const params = new URLSearchParams({ returnTo });
      navigate(`/breedings/${created.id}/transfer?${params.toString()}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>発情を登録</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        発情した日と兆候を記録し、授精師の判断に合わせて「種付する」か「今回は種付しない」を選びます。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            {openedFromCattle ? (
              <Card variant="outlined">
                <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象牛</Typography></Grid>
                    <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{targetName}</Typography></Grid>
                    <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{targetNumber}</Typography></Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <CattlePicker
                onSelect={(cattle) => setForm((prev) => ({ ...prev, cowEarTag: cattle.earTag, cowName: cattle.name }))}
              />
            )}

            {!openedFromCattle && form.cowEarTag && form.cowName && (
              <Alert severity="success">対象牛：{form.cowName}（耳標 {form.cowEarTag}）</Alert>
            )}

            <Typography variant="h6" fontWeight={800}>発情</Typography>
            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="発情日"
                  type="date"
                  value={form.heatDate}
                  onChange={(event) => setValue('heatDate', event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="発情区分"
                  select
                  value={form.estrusType ?? ''}
                  onChange={(event) => setValue('estrusType', event.target.value)}
                  required
                  fullWidth
                >
                  <MenuItem value="">選択してください</MenuItem>
                  <MenuItem value="自然発情">自然発情</MenuItem>
                  <MenuItem value="繁殖治療による発情">繁殖治療による発情</MenuItem>
                </TextField>
              </Grid>
            </Grid>

            <Stack spacing={0.25}>
              <Typography variant="subtitle1" fontWeight={700}>発情兆候</Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
                {['粘液', 'スタンディング', '咆哮', '乗駕', '落ち着きがない', '外陰部の腫れ'].map((sign) => (
                  <FormControlLabel
                    key={sign}
                    label={sign}
                    control={
                      <Checkbox
                        size="small"
                        checked={(form.estrusSigns ?? []).includes(sign)}
                        onChange={(event) => {
                          setForm((prev) => {
                            const current = prev.estrusSigns ?? [];
                            const estrusSigns = event.target.checked
                              ? [...current, sign]
                              : current.filter((item) => item !== sign);
                            return { ...prev, estrusSigns };
                          });
                        }}
                      />
                    }
                  />
                ))}
              </Stack>
            </Stack>

            <TextField
              label="その他の発情兆候"
              value={form.estrusSignsOther ?? ''}
              onChange={(event) => setValue('estrusSignsOther', event.target.value)}
              placeholder="例：食欲低下、尾を上げる、他牛への接近など"
              fullWidth
            />

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={1.25}>
                  <Typography variant="h6" fontWeight={800}>種付の判断</Typography>
                  <Typography color="text.secondary">授精師の判断に合わせて選択してください。</Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Button
                        variant={decision === 'inseminate' ? 'contained' : 'outlined'}
                        size="large"
                        fullWidth
                        onClick={() => setDecision('inseminate')}
                      >
                        種付する
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        variant={decision === 'wait' ? 'contained' : 'outlined'}
                        size="large"
                        fullWidth
                        onClick={() => setDecision('wait')}
                      >
                        今回は種付しない
                      </Button>
                    </Grid>
                  </Grid>

                  {decision === 'inseminate' && (
                    <Alert severity="info">発情を保存して、そのまま種付日・種雄牛の入力へ進みます。</Alert>
                  )}

                  {decision === 'wait' && (
                    <TextField
                      label="次回発情予定日"
                      type="date"
                      value={form.nextHeatExpectedDate || ''}
                      onChange={(event) => setValue('nextHeatExpectedDate', event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText={`発情日から${cycleDays}日後を自動表示します。必要なら変更できます。`}
                      required
                      fullWidth
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>

            <TextField
              label="メモ"
              value={form.note}
              onChange={(event) => setValue('note', event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            <Stack spacing={1}>
              <Button variant="contained" size="large" onClick={saveAndFinish} disabled={saving} fullWidth>
                {saving ? '保存中...' : decision === 'inseminate' ? '保存して種付へ進む' : '発情を保存'}
              </Button>
              <Button variant="outlined" size="large" onClick={saveAndGoToTransfer} disabled={saving} fullWidth>
                受精卵移植へ進む
              </Button>
              <Button variant="text" size="large" onClick={() => navigate(returnTo)} disabled={saving} fullWidth>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
