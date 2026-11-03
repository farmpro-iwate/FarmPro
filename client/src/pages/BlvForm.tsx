import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { BlvTestInput } from '../types/blv';
import { assertBlvSyncContext, BlvLocalSaveError, createBlvTest, deleteBlvTest, getBlvSyncContext,
  getBlvTest, updateBlvTest, type BlvSyncContext } from '../services/blvApi';
import { daysUntil, judgeBlvNextTest } from '../utils/blv';
import { CattlePicker } from '../components/CattlePicker';
import { useAiRecordFormDraft } from '../ai/useAiRecordFormDraft';
import { getAiRecordFormValues } from '../ai/recordFormDraft';
import { AiRecordDraftNotice } from '../components/AiRecordDraftNotice';

type Props = { mode: 'create' | 'edit' };
type FormAttempt = { context: BlvSyncContext; active: boolean; busy: boolean; localId: number | null };

const initialForm: BlvTestInput = {
  cowEarTag: '',
  cowName: '',
  testDate: '',
  result: '未検査',
  nextTestDate: '',
  isolationMemo: '',
  note: ''
};

export function BlvForm({ mode }: Props) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/blv';
  const aiDraft = useAiRecordFormDraft('blv', mode === 'create');
  const [form, setForm] = useState<BlvTestInput>(() => ({
    ...initialForm, ...getAiRecordFormValues<BlvTestInput>(aiDraft.draft),
  }));
  const [loading, setLoading] = useState(mode === 'edit');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const attemptRef = useRef<FormAttempt | null>(null);

  const isMountedAttempt = (attempt: FormAttempt) => attempt.active && attemptRef.current === attempt;
  const assertAttempt = (attempt: FormAttempt) => {
    if (!isMountedAttempt(attempt)) throw new Error('画面が変わったため、BLV検査記録の処理を中止しました。');
    assertBlvSyncContext(attempt.context);
  };
  const showFailure = (attempt: FormAttempt, cause: unknown) => {
    if (!isMountedAttempt(attempt)) return;
    try { assertAttempt(attempt); }
    catch {
      setLocked(true);
      setError('ログインまたは農場の情報が変わりました。画面を開き直して内容を確認してください。');
      return;
    }
    const detail = cause instanceof Error && !(cause instanceof TypeError)
      ? cause.message : '通信状態を確認して、もう一度お試しください。';
    setError(cause instanceof BlvLocalSaveError
      ? `BLV検査記録はこの端末に保存されています。同じ記録で保存を再試行できます。${detail}`
      : detail);
  };

  useEffect(() => {
    // An editor stays bound to the farm/user that opened it. Authentication
    // changes must not make its existing input a new save in another context.
    const attempt: FormAttempt = { context: getBlvSyncContext(), active: true, busy: false, localId: null };
    attemptRef.current = attempt;
    setForm({ ...initialForm, ...getAiRecordFormValues<BlvTestInput>(aiDraft.draft) });
    setBusy(false);
    setLocked(false);
    setError('');
    setLoading(mode === 'edit');
    if (mode === 'edit' && id) {
      getBlvTest(id).then((data) => {
        assertAttempt(attempt);
        setForm({
          cowEarTag: data.cowEarTag,
          cowName: data.cowName,
          testDate: data.testDate,
          result: data.result,
          nextTestDate: data.nextTestDate,
          isolationMemo: data.isolationMemo,
          note: data.note
        });
      }).catch(cause => showFailure(attempt, cause))
        .finally(() => { if (isMountedAttempt(attempt)) setLoading(false); });
    } else if (mode === 'edit') {
      setError('編集するBLV検査記録を確認できません。画面を開き直してください。');
      setLocked(true);
      setLoading(false);
    }
    return () => { attempt.active = false; };
  }, [mode, id, returnTo]);

  const setValue = (key: keyof BlvTestInput, value: string) => {
    if (attemptRef.current?.busy || locked) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const attempt = attemptRef.current;
    if (!attempt || attempt.busy || loading || locked) return;
    if (!form.cowEarTag || !form.cowName) {
      alert('耳標番号、牛名は必須です');
      return;
    }
    attempt.busy = true;
    setBusy(true);
    setError('');
    try {
      aiDraft.assertCurrent();
      assertAttempt(attempt);
      if (mode === 'create') {
        const saved = attempt.localId === null
          ? await createBlvTest(form) : await updateBlvTest(attempt.localId, form);
        attempt.localId = saved.id;
      } else if (id) await updateBlvTest(id, form);
      assertAttempt(attempt);
      navigate(returnTo);
    } catch (cause) {
      // Retain only the committed identity; the next explicit save uses the
      // current form fields, without creating a second record after a lost ACK.
      if (cause instanceof BlvLocalSaveError) attempt.localId = cause.record.id;
      showFailure(attempt, cause);
    } finally {
      attempt.busy = false;
      if (isMountedAttempt(attempt)) setBusy(false);
    }
  };

  const handleDelete = async () => {
    const attempt = attemptRef.current;
    if (mode !== 'edit' || !id || !attempt || attempt.busy || locked) return;
    if (!window.confirm('このBLV検査記録を削除しますか？')) return;
    attempt.busy = true;
    setBusy(true);
    setError('');
    try {
      assertAttempt(attempt);
      await deleteBlvTest(Number(id));
      assertAttempt(attempt);
      navigate(returnTo);
    } catch (cause) { showFailure(attempt, cause); }
    finally {
      attempt.busy = false;
      if (isMountedAttempt(attempt)) setBusy(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const status = judgeBlvNextTest(form.result, form.nextTestDate);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>{mode === 'create' ? 'BLV検査記録を新規登録' : 'BLV検査記録を編集'}</Typography>
      <AiRecordDraftNotice draft={aiDraft.draft} />
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CattlePicker
              onSelect={(cattle) => {
                if (attemptRef.current?.busy || locked) return;
                setForm((prev) => ({
                  ...prev,
                  cowEarTag: cattle.earTag,
                  cowName: cattle.name
                }));
              }}
            />

            <TextField label="耳標番号" value={form.cowEarTag} onChange={(e) => setValue('cowEarTag', e.target.value)} required fullWidth disabled={busy || locked} />
            <TextField label="牛名" value={form.cowName} onChange={(e) => setValue('cowName', e.target.value)} required fullWidth disabled={busy || locked} />
            <TextField label="検査日" type="date" value={form.testDate} onChange={(e) => setValue('testDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth disabled={busy || locked} />
            <TextField label="検査結果" select value={form.result} onChange={(e) => setValue('result', e.target.value)} fullWidth disabled={busy || locked}>
              <MenuItem value="未検査">未検査</MenuItem>
              <MenuItem value="陰性">陰性</MenuItem>
              <MenuItem value="陽性">陽性</MenuItem>
            </TextField>
            <TextField label="次回検査予定日" type="date" value={form.nextTestDate} onChange={(e) => setValue('nextTestDate', e.target.value)} InputLabelProps={{ shrink: true }} fullWidth disabled={busy || locked} />

            <Typography color="text.secondary">
              判定：{status}{form.nextTestDate ? ` / あと${daysUntil(form.nextTestDate)}日` : ''}
            </Typography>

            <TextField label="陽性牛の隔離メモ" value={form.isolationMemo} onChange={(e) => setValue('isolationMemo', e.target.value)} multiline minRows={3} fullWidth disabled={busy || locked} />
            <TextField label="備考" value={form.note} onChange={(e) => setValue('note', e.target.value)} multiline minRows={3} fullWidth disabled={busy || locked} />

            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="large" onClick={handleSubmit} disabled={busy || locked}>{busy ? '処理中...' : '保存'}</Button>
              <Button component={RouterLink} to={returnTo} variant="outlined" size="large">戻る</Button>
              {mode === 'edit' && <Button color="error" variant="outlined" size="large" onClick={handleDelete} disabled={busy || locked}>削除</Button>}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
