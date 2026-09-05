import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { InseminatorSearchField } from '../components/InseminatorSearchField';
import { PartnerSearchField } from '../components/PartnerSearchField';
import { SireSearchField } from '../components/SireSearchField';
import { getBreeding, updateBreeding } from '../services/breedingApi';
import { getFarmSettings } from '../services/settingsApi';
import type { BreedingInput } from '../types/breeding';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpectedDate,
} from '../utils/breeding';

type Props = {
  kind: 'insemination' | 'transfer';
};

export function BreedingExecutionForm({ kind }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const returnTo = requestedReturnTo.startsWith('/cattle/') ? requestedReturnTo : '/breedings';

  const [form, setForm] = useState<BreedingInput | null>(null);
  const [cycleDays, setCycleDays] = useState(21);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const [breeding, settings] = await Promise.all([getBreeding(id), getFarmSettings()]);
      setCycleDays(settings.estrousCycleDays || 21);
      setForm({
        ...breeding,
        breedingMethod: kind === 'insemination' ? '種付' : '受精卵移植',
      });
    }
    load();
  }, [id, kind]);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!id || !form) return;
    const actionDate = kind === 'insemination' ? form.inseminationDate : form.transferDate;
    if (!actionDate) {
      alert(kind === 'insemination' ? '種付・授精日を入力してください' : '移植実施日を入力してください');
      return;
    }

    setSaving(true);
    try {
      const nextHeatExpectedDate = calculateNextHeatExpectedDate(actionDate, cycleDays);
      const pregnancyCheckExpectedDate = calculatePregnancyCheckExpectedDate(actionDate, cycleDays);
      const expectedCalvingDate = calculateExpectedCalvingDate(actionDate);

      await updateBreeding(id, {
        ...form,
        breedingMethod: kind === 'insemination' ? '種付' : '受精卵移植',
        breedingStatus: kind === 'insemination' ? '種付実施' : '移植実施',
        nextHeatExpectedDate,
        pregnancyCheckExpectedDate,
        expectedCalvingDate,
      });
      navigate(returnTo);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Typography>読み込み中...</Typography>;

  const title = kind === 'insemination' ? '種付を実施' : '受精卵移植を実施';
  const saveLabel = kind === 'insemination' ? '種付を保存' : '受精卵移植を保存';

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>{title}</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        発情登録の対象牛と発情日を引き継いでいます。ここでは実施内容だけを登録します。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象牛</Typography></Grid>
                  <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.cowName}</Typography></Grid>
                  <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.cowEarTag}</Typography></Grid>
                  <Grid item xs={12} sm={3}><Typography fontWeight={700}>発情日</Typography></Grid>
                  <Grid item xs={12} sm={9}><Typography>{form.heatDate || '未入力'}</Typography></Grid>
                </Grid>
              </CardContent>
            </Card>

            {kind === 'insemination' ? (
              <>
                <Typography variant="h6" fontWeight={800}>種付内容</Typography>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="種付・授精日"
                      type="date"
                      value={form.inseminationDate}
                      onChange={(event) => setValue('inseminationDate', event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <SireSearchField
                      value={form.bullName}
                      masterId={form.bullMasterId}
                      onChange={(name, masterId) => setForm((prev) => prev ? { ...prev, bullName: name, bullMasterId: masterId } : prev)}
                      label="種雄牛"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <InseminatorSearchField
                      value={form.inseminatorName}
                      masterId={form.inseminatorMasterId}
                      onChange={(name, masterId) => setForm((prev) => prev ? { ...prev, inseminatorName: name, inseminatorMasterId: masterId } : prev)}
                    />
                  </Grid>
                </Grid>
              </>
            ) : (
              <>
                <Typography variant="h6" fontWeight={800}>受精卵移植内容</Typography>
                <Grid container spacing={1.25}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="移植実施日"
                      type="date"
                      value={form.transferDate}
                      onChange={(event) => setValue('transferDate', event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      required
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="受精卵番号・管理番号"
                      value={form.embryoNumber}
                      onChange={(event) => setValue('embryoNumber', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="採卵日"
                      type="date"
                      value={form.collectionDate}
                      onChange={(event) => setValue('collectionDate', event.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="受精卵区分"
                      select
                      value={form.embryoType}
                      onChange={(event) => setValue('embryoType', event.target.value)}
                      fullWidth
                    >
                      <MenuItem value="未選択">未選択</MenuItem>
                      <MenuItem value="新鮮卵">新鮮卵</MenuItem>
                      <MenuItem value="凍結卵">凍結卵</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="受精卵ランク・品質"
                      value={form.embryoGrade}
                      onChange={(event) => setValue('embryoGrade', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="供卵牛名（遺伝的母牛）"
                      value={form.donorCowName}
                      onChange={(event) => setValue('donorCowName', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="供卵牛耳標番号"
                      value={form.donorCowEarTag}
                      onChange={(event) => setValue('donorCowEarTag', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <SireSearchField
                      value={form.embryoSireName}
                      masterId={form.embryoSireMasterId}
                      onChange={(name, masterId) => setForm((prev) => prev ? { ...prev, embryoSireName: name, embryoSireMasterId: masterId } : prev)}
                      label="受精卵の父牛"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="ストロー番号"
                      value={form.strawNumber}
                      onChange={(event) => setValue('strawNumber', event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <PartnerSearchField
                      label="購入先・所有者"
                      value={form.supplierName}
                      masterId={form.supplierMasterId}
                      onChange={(name, masterId) => setForm((prev) => prev ? { ...prev, supplierName: name, supplierMasterId: masterId } : prev)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <InseminatorSearchField
                      label="移植担当者"
                      value={form.transferTechnician}
                      masterId={form.transferTechnicianMasterId}
                      onChange={(name, masterId) => setForm((prev) => prev ? { ...prev, transferTechnician: name, transferTechnicianMasterId: masterId } : prev)}
                    />
                  </Grid>
                </Grid>
              </>
            )}

            <TextField
              label="メモ"
              value={form.note}
              onChange={(event) => setValue('note', event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSave} disabled={saving} fullWidth>
                {saving ? '保存中...' : saveLabel}
              </Button>
              <Button variant="outlined" size="large" onClick={() => navigate(returnTo)} fullWidth>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
