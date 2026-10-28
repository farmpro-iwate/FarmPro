import { useEffect, useState } from 'react';
import { getSupplyBatches, getSupplyMovements, type SupplyBatch } from '../services/supplyInventoryApi';
import { saveBreedingWithEmbryoInventory } from '../services/breedingInventoryLink';
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
  const [embryoBatches, setEmbryoBatches] = useState<SupplyBatch[]>([]);
  const [batch, setBatch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (kind !== 'transfer') return;
    getSupplyMovements().then((rows) => setEmbryoBatches(getSupplyBatches(rows, '受精卵'))).catch(() => setError('受精卵在庫を読み込めませんでした。'));
  }, [kind]);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const [breeding, settings] = await Promise.all([getBreeding(id), getFarmSettings()]);
      setCycleDays(settings.estrousCycleDays || 21);
      setBatch(breeding.embryoInventoryBatchKey || '');
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

    setError('');
    setSaving(true);
    try {
      const nextHeatExpectedDate = calculateNextHeatExpectedDate(actionDate, cycleDays);
      const pregnancyCheckExpectedDate = calculatePregnancyCheckExpectedDate(actionDate, cycleDays);
      const expectedCalvingDate = calculateExpectedCalvingDate(actionDate);

      const updated = {
        ...form,
        breedingMethod: kind === 'insemination' ? '種付' : '受精卵移植',
        breedingStatus: kind === 'insemination' ? '種付実施' : '移植実施',
        nextHeatExpectedDate,
        pregnancyCheckExpectedDate,
        expectedCalvingDate,
      };
      if (kind === 'transfer') {
        if (!updated.embryoSource) { setError('受精卵の使用元を選んでください。'); return; }
        await saveBreedingWithEmbryoInventory(id, updated, batch);
      } else {
        await updateBreeding(id, updated);
      }
      navigate(returnTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移植記録を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Typography>読み込み中...</Typography>;

  const title = kind === 'insemination' ? '種付を実施' : '受精卵移植を実施';

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
                <TextField select label="受精卵の使用元" value={form.embryoSource || ''} onChange={(event) => { setForm((prev) => prev ? { ...prev, embryoSource: event.target.value as 'farm_stock' | 'external', embryoInventoryBatchKey: undefined } : prev); setBatch(''); }} fullWidth required>
                  <MenuItem value="">選択してください</MenuItem>
                  <MenuItem value="farm_stock">農場在庫から使用</MenuItem>
                  <MenuItem value="external">外部から持ち込み（在庫は減らさない）</MenuItem>
                </TextField>
                {form.embryoSource === 'farm_stock' && <TextField select label="使用する受精卵在庫" value={batch} onChange={(event) => { const key = event.target.value; setBatch(key); const selected = embryoBatches.find((row) => row.key === key); if (selected) setForm((prev) => prev ? { ...prev, embryoNumber: selected.lotNumber, embryoSireName: selected.sire || prev.embryoSireName, donorCowName: selected.donorCow || prev.donorCowName, embryoGrade: selected.grade || prev.embryoGrade } : prev); }} fullWidth required>
                  <MenuItem value="">受精卵を選択</MenuItem>
                  {embryoBatches.filter((row) => row.balance > 0 || row.key === form.embryoInventoryBatchKey).map((row) => <MenuItem key={row.key} value={row.key}>{row.lotNumber}／{row.itemName}／{row.storageLocation || '保管場所なし'}（残り{row.balance}個）</MenuItem>)}
                </TextField>}
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

            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSave} disabled={saving} fullWidth>
                {saving ? '保存中...' : `${title}を保存`}
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
