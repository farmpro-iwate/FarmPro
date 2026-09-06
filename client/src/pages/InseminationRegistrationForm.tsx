import { useState } from 'react';
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
import { InseminatorSearchField } from '../components/InseminatorSearchField';
import { SireSearchField } from '../components/SireSearchField';
import { createBreeding } from '../services/breedingApi';
import { getFarmSettings } from '../services/settingsApi';
import type { BreedingInput } from '../types/breeding';
import {
  calculateExpectedCalvingDate,
  calculateNextHeatExpectedDate,
  calculatePregnancyCheckExpectedDate,
} from '../utils/breeding';

const initialForm: BreedingInput = {
  cowEarTag: '',
  cowName: '',
  heatDate: '',
  estrusType: '',
  breedingMethod: '種付',
  breedingStatus: '種付実施',
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

export function InseminationRegistrationForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<BreedingInput>(initialForm);
  const [saving, setSaving] = useState(false);

  const setValue = (key: keyof BreedingInput, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.cowEarTag || !form.cowName) return alert('対象牛を選択してください');
    if (!form.inseminationDate) return alert('種付・授精日を入力してください');

    setSaving(true);
    try {
      const settings = await getFarmSettings();
      const cycleDays = settings.estrousCycleDays || 21;
      const actionDate = form.inseminationDate;

      await createBreeding({
        ...form,
        breedingMethod: '種付',
        breedingStatus: '種付実施',
        nextHeatExpectedDate: calculateNextHeatExpectedDate(actionDate, cycleDays),
        pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(actionDate, cycleDays),
        expectedCalvingDate: calculateExpectedCalvingDate(actionDate),
      });
      navigate('/breedings');
    } catch (error) {
      alert(error instanceof Error ? error.message : '種付を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.25}>
      <Typography variant="h5" fontWeight={800}>種付を登録</Typography>
      <Alert severity="info" sx={{ py: 0.5 }}>
        発情登録を経由せず、種付・授精の実施記録を直接登録します。
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
                  onChange={(name, masterId) => setForm((prev) => ({ ...prev, bullName: name, bullMasterId: masterId }))}
                  label="種雄牛"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <InseminatorSearchField
                  value={form.inseminatorName}
                  masterId={form.inseminatorMasterId}
                  onChange={(name, masterId) => setForm((prev) => ({ ...prev, inseminatorName: name, inseminatorMasterId: masterId }))}
                />
              </Grid>
            </Grid>

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
                {saving ? '保存中...' : '種付を保存'}
              </Button>
              <Button variant="outlined" size="large" onClick={() => navigate('/')} fullWidth>
                戻る
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default InseminationRegistrationForm;
