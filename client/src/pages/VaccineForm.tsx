import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Vaccine, VaccineInput } from '../types/vaccine';
import { createVaccine, getVaccine, updateVaccine } from '../services/vaccineApi';
import { deleteExpenseBySource, upsertExpenseBySource } from '../services/expensesApi';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';
import { daysUntil, judgeVaccineDue } from '../utils/vaccine';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { CattlePicker } from '../components/CattlePicker';
import { CalfPicker } from '../components/CalfPicker';
import { MedicineSearchField } from '../components/MedicineSearchField';

type Props = { mode: 'create' | 'edit' };

const initialForm: VaccineInput = {
  targetType: '成牛',
  targetNumber: '',
  targetName: '',
  vaccineName: '',
  vaccineCost: '',
  vaccinationDate: '',
  nextDueDate: '',
  status: '未接種',
  note: ''
};

export function VaccineForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialTargetNumber = mode === 'create' ? searchParams.get('targetNumber') ?? '' : '';
  const initialTargetName = mode === 'create' ? searchParams.get('targetName') ?? '' : '';
  const requestedTargetType = mode === 'create' ? searchParams.get('targetType') ?? '' : '';
  const initialTargetType = requestedTargetType === '子牛' ? '子牛' : '成牛';
  const openedFromAnimal = mode === 'create' && Boolean(initialTargetNumber);
  const [form, setForm] = useState<VaccineInput>(() => ({
    ...initialForm,
    targetType: initialTargetType,
    targetNumber: initialTargetNumber,
    targetName: initialTargetName
  }));
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [cattleOptions, setCattleOptions] = useState<Awaited<ReturnType<typeof getCattleList>>>([]);
  const [calfOptions, setCalfOptions] = useState<Awaited<ReturnType<typeof getCalfList>>>([]);

  useEffect(() => {
    if (mode === 'create') {
      setForm({
        ...initialForm,
        targetType: initialTargetType,
        targetNumber: initialTargetNumber,
        targetName: initialTargetName
      });
      return;
    }

    if (mode === 'edit' && id) {
      getVaccine(id).then((data) => {
        setForm({
          targetType: data.targetType,
          targetNumber: data.targetNumber,
          targetName: data.targetName,
          vaccineName: data.vaccineName,
          vaccineCost: data.vaccineCost || '',
          vaccinationDate: data.vaccinationDate,
          nextDueDate: data.nextDueDate,
          status: data.status,
          note: data.note
        });
      }).finally(() => setLoading(false));
    }
  }, [mode, id, initialTargetType, initialTargetNumber, initialTargetName]);

  useEffect(() => {
    Promise.all([
      getCattleList().catch(() => []),
      getCalfList().catch(() => []),
    ]).then(([cattle, calves]) => {
      setCattleOptions(cattle);
      setCalfOptions(calves);
    });
  }, []);

  const setValue = (key: keyof VaccineInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTargetNumberChange = (value: string) => {
    const targetNumber = value.trim();
    let matchedName = '';

    if (form.targetType === '成牛') {
      matchedName = cattleOptions.find((item) => item.earTag.trim() === targetNumber)?.name || '';
    } else {
      const calf = calfOptions.find((item) => {
        const displayedNumber = formatTemporaryCalfNumber(item.calfNumber, item.birthday);
        return item.calfNumber.trim() === targetNumber
          || item.temporaryCalfNumber?.trim() === targetNumber
          || displayedNumber.trim() === targetNumber;
      });
      matchedName = calf?.name || '';
    }

    setForm((prev) => ({
      ...prev,
      targetNumber: value,
      targetName: matchedName,
    }));
  };

  const handleTargetTypeChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      targetType: value,
      targetNumber: '',
      targetName: '',
    }));
  };

  const validateForm = () => {
    if (!form.targetType || !form.targetNumber || !form.targetName || !form.vaccineName) {
      alert('必須項目を入力してください');
      return false;
    }

    if (form.vaccineCost.trim()) {
      const cost = Number(form.vaccineCost);
      if (!Number.isFinite(cost) || cost < 0) {
        alert('ワクチン費用は0以上の数字で入力してください');
        return false;
      }
      if (cost > 0 && form.status === '接種済み' && !form.vaccinationDate) {
        alert('ワクチン費用を経費へ反映するには接種日を入力してください');
        return false;
      }
    }

    return true;
  };

  const resolveExpenseAnimal = async () => {
    const targetNumber = form.targetNumber.trim();
    const [cattleList, calfList] = await Promise.all([
      getCattleList().catch(() => []),
      getCalfList().catch(() => []),
    ]);

    const cattle = cattleList.find((item) => item.earTag.trim() === targetNumber);
    if (cattle) {
      return {
        animalType: 'cattle' as const,
        animalId: String(cattle.id),
        animalEarTag: cattle.earTag,
        animalName: cattle.name,
      };
    }

    const calf = calfList.find((item) => {
      const displayedNumber = formatTemporaryCalfNumber(item.calfNumber, item.birthday);
      return item.calfNumber.trim() === targetNumber
        || item.temporaryCalfNumber?.trim() === targetNumber
        || displayedNumber.trim() === targetNumber;
    });
    if (calf) {
      return {
        animalType: 'calf' as const,
        animalId: String(calf.id),
        animalEarTag: calf.calfNumber,
        animalName: calf.name,
      };
    }

    return {};
  };

  const syncVaccineExpense = async (vaccine: Vaccine) => {
    const sourceId = String(vaccine.id);
    const cost = Number(form.vaccineCost || 0);

    if (form.status !== '接種済み' || cost <= 0) {
      await deleteExpenseBySource('vaccine', sourceId, '医薬品費');
      return;
    }

    const animal = await resolveExpenseAnimal();
    await upsertExpenseBySource({
      paymentDate: form.vaccinationDate,
      category: '医薬品費',
      expenseCategoryMasterId: undefined,
      description: `ワクチン：${form.vaccineName}`,
      vendor: '',
      vendorMasterId: undefined,
      amount: String(cost),
      paymentMethod: '',
      target: `${form.targetNumber} ${form.targetName}`.trim(),
      ...animal,
      sourceType: 'vaccine',
      sourceId,
      memo: `ワクチン記録から自動作成（ワクチン記録ID: ${sourceId}）`,
    });
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const saved = mode === 'create'
        ? await createVaccine(form)
        : id
          ? await updateVaccine(id, form)
          : undefined;

      if (saved) await syncVaccineExpense(saved);
      navigate('/vaccines');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const label = judgeVaccineDue(form.status, form.nextDueDate);

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? 'ワクチン記録を新規登録' : 'ワクチン記録を編集'}</Typography>
      <Card>
        <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
          <Stack spacing={1.5}>
            {openedFromAnimal ? (
              <Card variant="outlined">
                <CardContent sx={{ py: 1.25, px: 1.5, '&:last-child': { pb: 1.25 } }}>
                  <Grid container spacing={1} alignItems="center">
                    <Grid item xs={12} sm={3}><Typography fontWeight={900}>対象個体</Typography></Grid>
                    <Grid item xs={7} sm={5}><Typography variant="h6" fontWeight={900}>{form.targetName}</Typography></Grid>
                    <Grid item xs={5} sm={4}><Typography color="text.secondary">耳標番号：{form.targetNumber}</Typography></Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Grid container spacing={1.25}>
                <Grid item xs={12} sm={6}>
                  <CattlePicker
                    label="登録済み繁殖牛から選択"
                    onSelect={(cattle) => {
                      setForm((prev) => ({
                        ...prev,
                        targetType: '成牛',
                        targetNumber: cattle.earTag,
                        targetName: cattle.name
                      }));
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <CalfPicker
                    label="登録済み子牛から選択"
                    onSelect={(calf) => {
                      setForm((prev) => ({
                        ...prev,
                        targetType: '子牛',
                        targetNumber: calf.calfNumber,
                        targetName: calf.name
                      }));
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label="対象区分" select value={form.targetType} onChange={(e) => handleTargetTypeChange(e.target.value)} fullWidth>
                    <MenuItem value="成牛">繁殖牛</MenuItem>
                    <MenuItem value="子牛">子牛</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}><TextField label="対象番号" value={form.targetNumber} onChange={(e) => handleTargetNumberChange(e.target.value)} required fullWidth /></Grid>
                <Grid item xs={12} sm={4}><TextField label="対象名" value={form.targetName} onChange={(e) => setValue('targetName', e.target.value)} helperText="登録済みの対象番号と一致すると自動表示します。" required fullWidth /></Grid>
              </Grid>
            )}

            <MedicineSearchField
              value={form.vaccineName}
              onChange={(value) => setValue('vaccineName', value)}
              required
            />

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={4}><TextField label="接種日" type="date" value={form.vaccinationDate} onChange={(e) => setValue('vaccinationDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
              <Grid item xs={12} sm={4}><TextField label="次回予定日" type="date" value={form.nextDueDate} onChange={(e) => setValue('nextDueDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="状態" select value={form.status} onChange={(e) => setValue('status', e.target.value)} fullWidth>
                  <MenuItem value="未接種">未接種</MenuItem>
                  <MenuItem value="接種済み">接種済み</MenuItem>
                </TextField>
              </Grid>
            </Grid>

            <TextField
              label="ワクチン費用（円）"
              type="number"
              value={form.vaccineCost}
              onChange={(e) => setValue('vaccineCost', e.target.value)}
              inputProps={{ min: 0, step: 1 }}
              helperText="接種済みで保存すると、経費管理の「医薬品費」へ自動反映されます。"
              fullWidth
            />

            {form.status === '未接種' && Number(form.vaccineCost || 0) > 0 && (
              <Alert severity="info">未接種の予定段階では経費へ反映しません。接種後に「接種済み」へ変更して保存すると反映されます。</Alert>
            )}

            <Typography color="text.secondary">判定：{label}{form.nextDueDate ? ` / あと${daysUntil(form.nextDueDate)}日` : ''}</Typography>
            <TextField label="メモ" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={2} fullWidth />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving} fullWidth>{saving ? '保存中...' : '保存'}</Button>
              <Button component={RouterLink} to="/vaccines" variant="outlined" size="large" fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
