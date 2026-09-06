import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CattlePicker } from '../components/CattlePicker';
import { createBreeding } from '../services/breedingApi';
import type { BreedingInput } from '../types/breeding';

function addDays(dateText: string, days: number) {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const initialForm: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
  estrusType: '',
  breedingMethod: '受精卵移植',
  breedingStatus: '移植予定',
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

export function EmbryoTransferPlanForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<BreedingInput>(initialForm);
  const [saving, setSaving] = useState(false);

  const plannedDate = useMemo(() => addDays(form.heatDate, 7), [form.heatDate]);

  const handleSave = async () => {
    if (!form.cowEarTag || !form.cowName) return alert('対象牛を選択してください');
    if (!form.heatDate) return alert('発情確認日を入力してください');
    if (!plannedDate) return alert('移植予定日を計算できませんでした');

    setSaving(true);
    try {
      await createBreeding({
        ...form,
        breedingMethod: '受精卵移植',
        breedingStatus: '移植予定',
        transferPlannedDate: plannedDate,
      });
      navigate('/breedings');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'ET予定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>受精卵移植（ET）の予定を登録</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        発情確認日から7日後を移植予定日として登録し、ホームの近日予定・アラート・カレンダーへ連携します。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <CattlePicker
              onSelect={(cattle) => setForm((prev) => ({ ...prev, cowEarTag: cattle.earTag, cowName: cattle.name }))}
            />

            {form.cowEarTag && form.cowName && (
              <Alert severity="success">対象牛：{form.cowName}（耳標 {form.cowEarTag}）</Alert>
            )}

            <Grid container spacing={1.25}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="発情確認日"
                  type="date"
                  value={form.heatDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, heatDate: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="移植予定日（自動計算）"
                  type="date"
                  value={plannedDate}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
              </Grid>
            </Grid>

            {plannedDate && (
              <Alert severity="warning">
                移植予定日：{plannedDate}。当日は繁殖管理・アラート・カレンダーから確認できます。
              </Alert>
            )}

            <TextField
              label="メモ"
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              multiline
              minRows={2}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" size="large" onClick={handleSave} disabled={saving} fullWidth>
                {saving ? '保存中...' : 'ET予定を保存'}
              </Button>
              <Button variant="outlined" size="large" onClick={() => navigate('/breedings/method')} fullWidth>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default EmbryoTransferPlanForm;
