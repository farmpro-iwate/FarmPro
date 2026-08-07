import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CattlePicker } from '../components/CattlePicker';
import { createBreeding } from '../services/breedingApi';
import type { BreedingInput } from '../types/breeding';

const initialForm: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
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
  const [savedId, setSavedId] = useState<string | number | null>(null);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const cowEarTag = openedFromCattle ? targetNumber : form.cowEarTag;
    const cowName = openedFromCattle ? targetName : form.cowName;
    if (!cowEarTag || !cowName) return alert('対象牛を選択してください');
    if (!form.heatDate) return alert('発情日を入力してください');

    setSaving(true);
    try {
      const created = await createBreeding({
        ...form,
        cowEarTag,
        cowName,
        breedingMethod: '未選択',
        breedingStatus: '発情確認',
      });
      setSavedId(created.id);
    } finally {
      setSaving(false);
    }
  };

  const goToAction = (kind: 'insemination' | 'transfer') => {
    if (!savedId) return;
    const params = new URLSearchParams({ returnTo });
    navigate(`/breedings/${savedId}/${kind}?${params.toString()}`);
  };

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>発情を登録</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        発情した日と兆候を記録します。種付や受精卵移植を行う場合は、発情登録後に次の画面へ進みます。
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
            <TextField
              label="発情日"
              type="date"
              value={form.heatDate}
              onChange={(event) => setValue('heatDate', event.target.value)}
              InputLabelProps={{ shrink: true }}
              required
              fullWidth
            />

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

            <TextField
              label="メモ"
              value={form.note}
              onChange={(event) => setValue('note', event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            {!savedId ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="contained" size="large" onClick={handleSave} disabled={saving} fullWidth>
                  {saving ? '保存中...' : '発情を保存'}
                </Button>
                <Button variant="outlined" size="large" onClick={() => navigate(returnTo)} fullWidth>
                  戻る
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1}>
                <Alert severity="success">発情を保存しました。続けて行った作業があれば登録できます。</Alert>
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={6}>
                    <Button variant="contained" size="large" onClick={() => goToAction('insemination')} fullWidth>
                      種付を実施
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button variant="outlined" size="large" onClick={() => goToAction('transfer')} fullWidth>
                      受精卵移植を実施
                    </Button>
                  </Grid>
                </Grid>
                <Button variant="text" onClick={() => navigate(returnTo)}>発情登録だけで終了</Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
