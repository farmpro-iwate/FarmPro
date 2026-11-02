import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { createManyTreatments, updateTreatment } from '../services/treatmentApi';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import type { Schedule } from '../types/schedule';
import type { TreatmentInput } from '../types/treatment';

function saveContext() {
  const user = getStoredAuthUser();
  return { farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), planId: getCurrentFarmProPlanId() };
}
type SaveView = { active: boolean; context: ReturnType<typeof saveContext> };
type SaveAttempt = {
  view: SaveView;
  signature: string;
  inputs: TreatmentInput[];
  scheduleIds: Array<string | number>;
  localIds: number[] | null;
  treatmentsConfirmed: boolean;
};

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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const programId = searchParams.get('programId') || '';
  const title = searchParams.get('title') || '';
  const returnTo = searchParams.get('returnTo') || '/schedules/synchronization/today';
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const viewRef = useRef<SaveView | null>(null);
  const attemptRef = useRef<SaveAttempt | null>(null);
  const signatureRef = useRef('');
  const [treatmentDate, setTreatmentDate] = useState(todayText());
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [veterinarian, setVeterinarian] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const view: SaveView = { active: true, context: saveContext() };
    viewRef.current = view;
    attemptRef.current = null;
    savingRef.current = false;
    setSaving(false);
    setLoading(true);
    setSaveError('');
    setItems([]);
    getScheduleList()
      .then(rows => {
        if (viewRef.current !== view || !view.active) return;
        assertView(view);
        setItems(rows);
      })
      .catch(error => {
        if (viewRef.current === view && view.active) {
          setSaveError(error instanceof Error ? error.message : '対象の予定を読み込めませんでした。');
        }
      })
      .finally(() => { if (viewRef.current === view && view.active) setLoading(false); });
    return () => {
      view.active = false;
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [location.key, location.pathname, location.search, location.hash]);

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
  const scheduleIds = targets.map(item => item.id);
  const signature = JSON.stringify({ inputs, scheduleIds, programId, title, returnTo });
  signatureRef.current = signature;

  function assertView(view: SaveView) {
    const current = saveContext();
    const expected = view.context;
    if (!view.active || viewRef.current !== view || current.farmId !== expected.farmId ||
        current.userId !== expected.userId || current.token !== expected.token || current.planId !== expected.planId) {
      throw new Error('ログイン・農場または画面の情報が変わったため、一括処置を中止しました。保存済みの記録を一覧で確認してください。');
    }
  }

  function assertAttempt(attempt: SaveAttempt) {
    assertView(attempt.view);
    if (attemptRef.current !== attempt || signatureRef.current !== attempt.signature) {
      throw new Error('保存待ちの処置と入力・対象が変わっています。入力を元に戻して再試行してください。保存済みの記録は一覧で確認できます。');
    }
  }

  function assertLocalIds(attempt: SaveAttempt): asserts attempt is SaveAttempt & { localIds: number[] } {
    if (!attempt.localIds || attempt.localIds.length !== attempt.inputs.length ||
        attempt.localIds.some(id => !Number.isSafeInteger(id)) || new Set(attempt.localIds).size !== attempt.localIds.length) {
      throw new Error('保存済みの治療記録を確認できません。新しい記録は追加せず中止しました。治療一覧を確認してください。');
    }
  }

  const handleSubmit = async () => {
    if (savingRef.current) return;
    if (invalidBulkType) return alert('人工授精・ETは一括繁殖治療の対象外です');
    if (!targets.length) return alert('一括実施できる予定がありません');
    if (!treatmentDate) return alert('実施日を入力してください');
    const view = viewRef.current;
    if (!view) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      assertView(view);
      let attempt = attemptRef.current;
      if (!attempt || (!attempt.localIds && attempt.signature !== signature)) {
        attempt = { view, signature, inputs: structuredClone(inputs), scheduleIds: [...scheduleIds],
          localIds: null, treatmentsConfirmed: false };
        attemptRef.current = attempt;
      }
      assertAttempt(attempt);
      const message = attempt.treatmentsConfirmed
        ? `${targets.length}頭の治療記録は保存済みです。元の予定を完了にします。よろしいですか？`
        : `${targets.length}頭すべてに「${title}」の実績を記録します。よろしいですか？`;
      if (!window.confirm(message)) return;
      assertAttempt(attempt);
      if (!attempt.treatmentsConfirmed) {
        if (attempt.localIds === null) {
          const currentAttempt = attempt;
          const saved = await createManyTreatments(attempt.inputs, { onLocalSaved: ids => {
            // Commit already happened. Remember IDs on this closed attempt even
            // when its context changed, then stop before cloud or follow-up work.
            currentAttempt.localIds = [...ids];
            assertAttempt(currentAttempt);
            assertLocalIds(currentAttempt);
          } });
          if (attempt.localIds === null) attempt.localIds = saved.map(record => record.id);
          assertAttempt(attempt);
          assertLocalIds(attempt);
          if (saved.length !== attempt.localIds.length || saved.some((record, index) =>
            record.id !== attempt.localIds![index] || record.cloudSyncPending === true)) {
            throw new Error('すべての治療記録の保存を確認できません。予定は完了にしていません。もう一度保存してください。');
          }
        } else {
          assertLocalIds(attempt);
          for (const [index, localId] of attempt.localIds.entries()) {
            assertAttempt(attempt);
            const saved = await updateTreatment(localId, attempt.inputs[index]);
            assertAttempt(attempt);
            if (saved.id !== localId || saved.cloudSyncPending === true) {
              throw new Error('治療記録の保存を確認できません。予定は完了にしていません。もう一度保存してください。');
            }
          }
        }
        attempt.treatmentsConfirmed = true;
      }
      assertAttempt(attempt);
      await completeSchedules(attempt.scheduleIds);
      assertAttempt(attempt);
      navigate(returnTo);
    } catch (error) {
      if (viewRef.current === view && view.active) {
        const message = error instanceof Error ? error.message : '治療記録と予定の保存を確認できませんでした。もう一度お試しください。';
        setSaveError(attemptRef.current?.treatmentsConfirmed ? `治療記録は保存済みです。${message}` : message);
      }
    } finally {
      if (viewRef.current === view && view.active) {
        savingRef.current = false;
        setSaving(false);
      }
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
              {saveError && <Alert severity="error">{saveError}</Alert>}

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
