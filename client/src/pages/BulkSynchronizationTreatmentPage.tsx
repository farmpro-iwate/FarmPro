import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getScheduleList, completeSchedules } from '../services/scheduleApi';
import { createManyTreatments } from '../services/treatmentApi';
import type { Schedule } from '../types/schedule';
import type { TreatmentInput } from '../types/treatment';

function todayText() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapTreatmentType(title: string): TreatmentInput['breedingTreatmentType'] {
  if (title.includes('排卵')) return '排卵誘起処置';
  if (title.includes('発情')) return '発情誘起処置';
  if (title.includes('同期')) return '発情・排卵同期化';
  if (title.includes('黄体')) return '黄体関連処置';
  return 'その他の繁殖処置';
}

export function BulkSynchronizationTreatmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const programId = searchParams.get('programId') || '';
  const title = searchParams.get('title') || '';
  const returnTo = searchParams.get('returnTo') || '/schedules/synchronization/today';
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [treatmentDate, setTreatmentDate] = useState(todayText());
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [veterinarian, setVeterinarian] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    getScheduleList()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const targets = useMemo(
    () => items.filter((item) =>
      item.synchronizationProgramId === programId &&
      item.title === title &&
      item.status !== '完了' &&
      item.dueDate === todayText(),
    ),
    [items, programId, title],
  );

  const invalidBulkType = title.includes('人工授精') || title.includes('種付') || title.includes('受精卵移植') || title.toUpperCase().includes('ET');

  const handleSubmit = async () => {
    if (invalidBulkType) return alert('人工授精・ETは一括繁殖治療の対象外です');
    if (!targets.length) return alert('一括実施できる予定がありません');
    if (!treatmentDate) return alert('実施日を入力してください');
    if (!window.confirm(`${targets.length}頭すべてに「${title}」の実績を記録します。よろしいですか？`)) return;

    const inputs: TreatmentInput[] = targets.map((item) => ({
      recordType: '繁殖治療',
      breedingTreatmentType: mapTreatmentType(item.title),
      targetNumber: item.targetNumber,
      targetName: item.targetName,
      symptom: item.title,
      diagnosis: '',
      treatmentProcedure: '',
      treatmentDate,
      medicine,
      dosage,
      withdrawalEndDate: '',
      veterinarian,
      progress: '繁殖継続',
      note,
      sourceScheduleId: String(item.id),
      synchronizationProgramId: item.synchronizationProgramId,
      synchronizationProgramName: item.synchronizationProgramName,
    }));

    setSaving(true);
    try {
      await createManyTreatments(inputs);
      await completeSchedules(targets.map((item) => item.id));
      navigate(returnTo);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Box sx={{ width: '100%', maxWidth: 960, mx: 'auto' }}>
      <Stack spacing={1.5}>
        <Typography variant="h5" fontWeight={800}>同期化処置を一括実施</Typography>
        <Alert severity="warning">
          対象牛を確認してから保存してください。保存すると各牛に別々の繁殖治療記録を作成し、元の予定を完了にします。
        </Alert>

        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={0.5}>
                <Typography variant="h6" fontWeight={900}>{title || '繁殖処置'}</Typography>
                <Typography color="text.secondary">対象：{targets.length}頭</Typography>
              </Stack>
              {targets.map((item) => (
                <Card key={item.id} variant="outlined">
                  <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.25}>
                      <Typography fontWeight={900}>{item.targetName || '-'}</Typography>
                      <Typography color="text.secondary">耳標 {item.targetNumber || '-'} / {item.synchronizationProgramName || '-'} / {item.synchronizationStep || ''}</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <TextField label="実施日" type="date" value={treatmentDate} onChange={(e) => setTreatmentDate(e.target.value)} InputLabelProps={{ shrink: true }} required fullWidth />
              <TextField label="薬剤名" value={medicine} onChange={(e) => setMedicine(e.target.value)} fullWidth />
              <TextField label="投与量" value={dosage} onChange={(e) => setDosage(e.target.value)} fullWidth />
              <TextField label="獣医師名" value={veterinarian} onChange={(e) => setVeterinarian(e.target.value)} fullWidth />
              <TextField label="メモ" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} fullWidth />

              {invalidBulkType && <Alert severity="error">人工授精・ETはこの一括実施画面では登録しません。</Alert>}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="contained" size="large" onClick={handleSubmit} disabled={saving || invalidBulkType || targets.length === 0} fullWidth>
                  {saving ? '保存中...' : `${targets.length}頭に記録して完了`}
                </Button>
                <Button component={RouterLink} to={returnTo} variant="outlined" size="large" fullWidth>戻る</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
