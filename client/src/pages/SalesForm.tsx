import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
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
import { createSale, emptySaleInput, SaleInput, SaleStatus, TargetType } from '../services/salesApi';
import { getTreatmentList } from '../services/treatmentApi';
import { PartnerSearchField } from '../components/PartnerSearchField';
import type { Treatment } from '../types/treatment';

const targetTypes: TargetType[] = ['子牛', '成牛', 'その他'];
const statuses: SaleStatus[] = ['出荷予定', '出荷済み', '販売済み', '取消'];
const breedingCowSaleRoutes = ['肥育してから販売・出荷', '即座に販売・出荷'] as const;
type BreedingCowSaleRoute = typeof breedingCowSaleRoutes[number] | '';

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SalesForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkedTargetNumber = searchParams.get('targetNumber') ?? '';
  const linkedTargetName = searchParams.get('targetName') ?? '';
  const linkedTargetType = searchParams.get('targetType') as TargetType | null;
  const linkedSex = searchParams.get('sex') ?? '';
  const linkedBirthday = searchParams.get('birthday') ?? '';
  const linkedMotherName = searchParams.get('motherName') ?? '';
  const linkedCalfId = searchParams.get('calfId') ?? '';
  const linkedCalvingId = searchParams.get('calvingId') ?? '';
  const linkedMotherCowId = searchParams.get('motherCowId') ?? '';
  const source = searchParams.get('source') ?? '';
  const returnTo = searchParams.get('returnTo') ?? '';
  const openedFromCalf = source === 'calf';
  const openedFromAnimal = Boolean(linkedTargetNumber) && !openedFromCalf;
  const [saleRoute, setSaleRoute] = useState<BreedingCowSaleRoute>('');
  const [form, setForm] = useState<SaleInput>(() => ({
    ...emptySaleInput,
    targetType: openedFromCalf ? '子牛' : openedFromAnimal ? '成牛' : linkedTargetType || emptySaleInput.targetType,
    targetNumber: linkedTargetNumber,
    targetName: linkedTargetName,
    sex: linkedSex,
    birthday: linkedBirthday,
    motherName: linkedMotherName,
    calfId: linkedCalfId,
    calvingId: linkedCalvingId,
    motherCowId: linkedMotherCowId,
  }));
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getTreatmentList().then(setTreatments).catch(() => setTreatments([]));
  }, []);

  const withdrawalEndDate = useMemo(() => {
    const target = form.targetNumber.trim();
    if (!target) return '';
    return treatments
      .filter((item) => item.targetNumber === target && Boolean(item.withdrawalEndDate))
      .map((item) => item.withdrawalEndDate)
      .sort((a, b) => b.localeCompare(a))[0] || '';
  }, [form.targetNumber, treatments]);

  const isCurrentlyInWithdrawal = Boolean(withdrawalEndDate && todayText() <= withdrawalEndDate);
  const plannedShipDate = form.shippingDate || form.shippingPlanDate || form.saleDate;
  const isPlannedBeforeWithdrawalEnd = Boolean(withdrawalEndDate && plannedShipDate && plannedShipDate <= withdrawalEndDate);

  function update<K extends keyof SaleInput>(key: K, value: SaleInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSaleRoute(value: BreedingCowSaleRoute) {
    setSaleRoute(value);
    setForm((prev) => {
      const routeReasons = breedingCowSaleRoutes.map((item) => `繁殖不能・${item}`);
      const existingReason = prev.reason.trim();
      const reasonWithoutRoute = routeReasons.includes(existingReason as typeof routeReasons[number]) ? '' : existingReason;
      return {
        ...prev,
        reason: value ? `繁殖不能・${value}` : reasonWithoutRoute,
        status: value === '即座に販売・出荷' && prev.status === '出荷予定' ? '出荷済み' : prev.status,
      };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!form.targetNumber.trim() && !form.targetName.trim()) {
      setError('対象番号または対象名を入力してください。');
      return;
    }

    if (openedFromAnimal && !saleRoute) {
      setError('販売・出荷までの進め方を選択してください。');
      return;
    }

    setSaving(true);

    try {
      await createSale(form);
      navigate(returnTo || '/sales');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>
          出荷・販売 新規登録
        </Typography>
        <Button component={RouterLink} to={returnTo || '/sales'} variant="outlined" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {returnTo ? (openedFromCalf ? '子牛情報へ戻る' : '個体カルテへ戻る') : '一覧へ戻る'}
        </Button>
      </Stack>

      {!openedFromAnimal && !openedFromCalf && (
        <Alert severity="info">
          対象個体を手入力して出荷・販売記録を登録します。
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack component="form" spacing={1.5} onSubmit={handleSubmit}>
            <Typography variant="h6" fontWeight={800}>対象情報</Typography>

            {openedFromCalf ? (
              <Card variant="outlined">
                <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象子牛</Typography></Grid>
                    <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.targetName || '-'}</Typography></Grid>
                    <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.targetNumber || '-'}</Typography></Grid>
                    <Grid item xs={12} sm={4}><Typography color="text.secondary">性別：{form.sex || '-'}</Typography></Grid>
                    <Grid item xs={12} sm={4}><Typography color="text.secondary">生年月日：{form.birthday || '-'}</Typography></Grid>
                    <Grid item xs={12} sm={4}><Typography color="text.secondary">母牛：{form.motherName || '-'}</Typography></Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : openedFromAnimal ? (
              <Card variant="outlined">
                <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象繁殖牛</Typography></Grid>
                    <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.targetName}</Typography></Grid>
                    <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.targetNumber}</Typography></Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={4}>
                  <TextField select label="区分" value={form.targetType} onChange={(e) => update('targetType', e.target.value as TargetType)} fullWidth>
                    {targetTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}><TextField label="対象番号" value={form.targetNumber} onChange={(e) => update('targetNumber', e.target.value)} fullWidth placeholder="例：C-001 / 1234" /></Grid>
                <Grid item xs={12} sm={4}><TextField label="対象名" value={form.targetName} onChange={(e) => update('targetName', e.target.value)} fullWidth placeholder="例：さくら" /></Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label="性別" select value={form.sex} onChange={(e) => update('sex', e.target.value)} fullWidth>
                    <MenuItem value="雌">♀</MenuItem>
                    <MenuItem value="雄">♂</MenuItem>
                    <MenuItem value="去勢">♂去</MenuItem>
                    <MenuItem value="不明">－</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}><TextField label="生年月日" type="date" value={form.birthday} onChange={(e) => update('birthday', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
                <Grid item xs={12} sm={4}><TextField label="母牛" value={form.motherName} onChange={(e) => update('motherName', e.target.value)} fullWidth /></Grid>
              </Grid>
            )}

            {isCurrentlyInWithdrawal && (
              <Alert severity="warning">
                現在この個体は休薬中です。休薬終了日は {withdrawalEndDate} です。製品表示・獣医師の指示を確認してから出荷してください。
              </Alert>
            )}

            {isPlannedBeforeWithdrawalEnd && (
              <Alert severity="error">
                入力した出荷・販売日が休薬終了日 {withdrawalEndDate} 以前です。日付と休薬条件を再確認してください。
              </Alert>
            )}

            {openedFromAnimal && (
              <>
                <TextField
                  select
                  label="販売・出荷までの進め方"
                  value={saleRoute}
                  onChange={(e) => updateSaleRoute(e.target.value as BreedingCowSaleRoute)}
                  required
                  fullWidth
                >
                  <MenuItem value="">選択してください</MenuItem>
                  {breedingCowSaleRoutes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
                {saleRoute === '肥育してから販売・出荷' && (
                  <Alert severity="info">肥育期間を経て出荷するため、出荷予定日と状態「出荷予定」を登録します。</Alert>
                )}
                {saleRoute === '即座に販売・出荷' && (
                  <Alert severity="warning">すぐに出荷する場合は、出荷日または販売日と実際の状態を確認して登録してください。</Alert>
                )}
              </>
            )}

            <Typography variant="h6" fontWeight={800}>出荷・販売情報</Typography>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><TextField label="出荷予定日" type="date" value={form.shippingPlanDate} onChange={(e) => update('shippingPlanDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="出荷日" type="date" value={form.shippingDate} onChange={(e) => update('shippingDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売日" type="date" value={form.saleDate} onChange={(e) => update('saleDate', e.target.value)} fullWidth InputLabelProps={{ shrink: true }} /></Grid>
              <Grid item xs={12} sm={6}><PartnerSearchField value={form.buyer} onChange={(value) => update('buyer', value)} /></Grid>
              <Grid item xs={12} sm={6}><TextField label="市場名" value={form.marketName} onChange={(e) => update('marketName', e.target.value)} fullWidth placeholder="例：岩手県南家畜市場" /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売体重 kg" value={form.saleWeight} onChange={(e) => update('saleWeight', e.target.value)} fullWidth placeholder="例：285" /></Grid>
              <Grid item xs={12} sm={4}><TextField label="販売金額 円" value={form.salePrice} onChange={(e) => update('salePrice', e.target.value)} fullWidth placeholder="例：650000" /></Grid>
              <Grid item xs={12} sm={4}>
                <TextField select label="状態" value={form.status} onChange={(e) => update('status', e.target.value as SaleStatus)} fullWidth>
                  {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12}><TextField label="販売理由" value={form.reason} onChange={(e) => update('reason', e.target.value)} fullWidth placeholder="例：繁殖不能・肥育してから販売・出荷" /></Grid>
              <Grid item xs={12}><TextField label="メモ" value={form.memo} onChange={(e) => update('memo', e.target.value)} fullWidth multiline minRows={2} placeholder="例：休薬確認済み、出荷前確認済み" /></Grid>
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button type="submit" variant="contained" disabled={saving} fullWidth>{saving ? '登録中...' : '登録する'}</Button>
              <Button component={RouterLink} to={returnTo || '/sales'} variant="outlined" fullWidth>キャンセル</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
