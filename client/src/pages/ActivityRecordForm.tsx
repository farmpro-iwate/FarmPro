import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Grid, Stack, TextField, Typography } from '@mui/material';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';
import { ActivityRecordLocalSaveError, assertActivityRecordSyncContext, createActivityRecord,
  getActivityRecord, getActivityRecordSyncContext, updateActivityRecord } from '../services/activityRecordsApi';
import type { ActivityRecordInput } from '../types/activityRecord';
import type { Cattle } from '../types/cattle';
import type { Calf } from '../types/calf';
import { activityAnimalFields, findActivityAnimal } from '../utils/activityRecordAnimal';
import { assertAnimalLifecycleIdentity, isAnimalDeceased } from '../utils/animalLifecycle';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { useFeedingFatteningFormAttempt } from './feedingFatteningPageSync';

type AnimalOption = { kind: 'cattle'; animal: Cattle } | { kind: 'calf'; animal: Calf };
type Props = { mode: 'create' | 'edit' };
const emptyAnimal = {
  animalKind: '' as const, animalId: '', animalSyncId: '', animalIdentificationNumber: '',
  animalEarTag: '', animalName: '', animalBirthday: '',
};
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function emptyForm(activityType: 'farm' | 'animal'): ActivityRecordInput {
  return { activityType, recordDate: today(), title: '', note: '', ...emptyAnimal };
}
function animalLabel(option: AnimalOption) {
  const kind = option.kind === 'calf' ? '子牛' : option.animal.stage || '繁殖牛';
  const rawNumber = option.kind === 'calf' ? option.animal.calfNumber : option.animal.earTag;
  const number = option.kind === 'calf' && isTemporaryCalfNumber(rawNumber)
    ? `仮番号 ${formatTemporaryCalfNumber(rawNumber, option.animal.birthday)}`
    : rawNumber ? `耳標 ${rawNumber}` : '耳標未登録';
  return `${option.animal.name || '名号未登録'}（${number}）・${kind}`;
}
function storedAnimalNumber(form: ActivityRecordInput) {
  return form.animalKind === 'calf' && isTemporaryCalfNumber(form.animalEarTag)
    ? `仮番号 ${formatTemporaryCalfNumber(form.animalEarTag, form.animalBirthday)}`
    : form.animalEarTag ? `耳標 ${form.animalEarTag}` : '耳標未登録';
}
function safeReturnTo(path: string | null, fallback: string) {
  return path && /^\/(?:activities(?:[/?]|$)|cattle\/[^/?#]+$|calves\/[^/?#]+$)/.test(path) ? path : fallback;
}

export function ActivityRecordForm({ mode }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedType = params.get('type') === 'animal' ? 'animal' : 'farm';
  const [form, setForm] = useState<ActivityRecordInput>(() => emptyForm(requestedType));
  const [options, setOptions] = useState<AnimalOption[]>([]);
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const sync = useFeedingFatteningFormAttempt(getActivityRecordSyncContext, assertActivityRecordSyncContext);
  const { saving, locked, error } = sync;
  const isFarm = form.activityType === 'farm';
  const label = isFarm ? '農場作業' : '個体の記録';
  const listPath = `/activities?type=${form.activityType}`;
  const returnTo = safeReturnTo(params.get('returnTo'), listPath);

  useEffect(() => {
    const attempt = sync.attemptRef.current;
    if (!attempt) return;
    let active = true;
    setLoading(true);
    setReady(false);
    setOptions([]);
    setSelectedAnimal(null);
    setForm(emptyForm(requestedType));
    sync.setError('');
    const load = async () => {
      let loaded = emptyForm(requestedType);
      if (mode === 'edit') {
        if (!id) throw new Error('記録を特定できませんでした。');
        const record = await getActivityRecord(id);
        sync.assertAttempt(attempt);
        // Only business fields are submitted; sync bookkeeping belongs to the API.
        loaded = {
          activityType: record.activityType, recordDate: record.recordDate, title: record.title, note: record.note,
          animalKind: record.animalKind, animalId: record.animalId, animalSyncId: record.animalSyncId,
          animalIdentificationNumber: record.animalIdentificationNumber, animalEarTag: record.animalEarTag,
          animalName: record.animalName, animalBirthday: record.animalBirthday,
        };
      }
      sync.assertAttempt(attempt);
      if (!active) return;
      setForm(loaded);
      if (loaded.activityType === 'animal') {
        try {
          const [cattle, calves] = await Promise.all([getCattleList(), getCalfList()]);
          sync.assertAttempt(attempt);
          if (!active) return;
          const all: AnimalOption[] = [
            ...cattle.map(animal => ({ kind: 'cattle' as const, animal })),
            ...calves.map(animal => ({ kind: 'calf' as const, animal })),
          ];
          const available = mode === 'create' ? all.filter(option => !isAnimalDeceased(option.animal)) : all;
          setOptions(available);
          if (mode === 'edit') {
            const found = findActivityAnimal(loaded, cattle, calves);
            if (found) setSelectedAnimal(available.find(option => option.kind === found.kind && String(option.animal.id) === String(found.animal.id)) || null);
          } else {
            const requestedId = params.get('animalId');
            const requestedKind = params.get('animalKind');
            if (requestedId && (requestedKind === 'cattle' || requestedKind === 'calf')) {
              const candidates = available.filter(option => option.kind === requestedKind && String(option.animal.id) === requestedId);
              if (candidates.length === 1) {
                setSelectedAnimal(candidates[0]);
                setForm({ ...loaded, ...activityAnimalFields(candidates[0].kind, candidates[0].animal) });
              } else sync.setError('対象の牛が見つかりません。台帳から選び直してください。');
            }
          }
        } catch (cause) {
          sync.assertAttempt(attempt);
          if (mode === 'create') throw cause;
          // Existing identity stays intact if a ledger is temporarily unavailable.
          sync.showFailure(attempt, cause, '対象牛の一覧を取得できませんでした。');
        }
      }
      sync.assertAttempt(attempt);
      if (active) setReady(true);
    };
    void load().catch(cause => { if (active) sync.showFailure(attempt, cause, '記録を読み込めませんでした。'); })
      .finally(() => { if (active && sync.isCurrentAttempt(attempt)) setLoading(false); });
    return () => { active = false; };
  }, [mode, id, sync.routeKey, reload]);

  function update(key: 'recordDate' | 'title' | 'note', value: string) {
    if (sync.attemptRef.current?.busy || locked || !ready) return;
    setForm(previous => ({ ...previous, [key]: value }));
  }
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    const attempt = sync.beginSaving();
    if (!attempt) return;
    try {
      sync.assertAttempt(attempt);
      if (!form.recordDate || !form.title.trim()) throw new Error('日付と内容を入力してください。');
      if (form.activityType === 'animal' && !form.animalKind) throw new Error('対象の牛を台帳から選択してください。');
      if (form.activityType === 'animal' && mode === 'create' && attempt.localId === null) {
        if (!selectedAnimal) throw new Error('対象の牛を台帳から選択してください。');
        const latest = selectedAnimal.kind === 'cattle' ? await getCattleList() : await getCalfList();
        sync.assertAttempt(attempt);
        const current = latest.find(animal => String(animal.id) === String(selectedAnimal.animal.id));
        if (!current) throw new Error('対象の牛が見つかりません。台帳から選び直してください。');
        assertAnimalLifecycleIdentity(current, selectedAnimal.animal);
        if (isAnimalDeceased(current)) throw new Error('死亡が登録された牛には、新しい個体の記録を追加できません。過去の記録は確認・修正できます。');
      }
      const payload = { ...form, title: form.title.trim(), ...(form.activityType === 'farm' ? emptyAnimal : {}) };
      if (mode === 'edit') {
        if (!id) throw new Error('記録を特定できませんでした。');
        await updateActivityRecord(id, payload);
      } else {
        const saved = attempt.localId === null
          ? await createActivityRecord(payload)
          : await updateActivityRecord(attempt.localId, payload);
        attempt.localId = saved.id;
      }
      sync.assertAttempt(attempt);
      navigate(returnTo);
    } catch (cause) {
      if (cause instanceof ActivityRecordLocalSaveError) attempt.localId = cause.record.id;
      sync.showFailure(attempt, cause, '記録を保存できませんでした。', cause instanceof ActivityRecordLocalSaveError);
    } finally { sync.finishSaving(attempt); }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>{mode === 'edit' && loading ? '活動記録を編集' : `${label}を${mode === 'edit' ? '編集' : '登録'}`}</Typography>
        <Button component={RouterLink} to={listPath} variant="outlined" disabled={saving}>記録一覧</Button>
      </Stack>
      <Typography color="text.secondary">{isFarm ? '清掃・敷料交換・設備の手入れなど、農場で行った作業を残します。' : '食欲や体調、日々の様子など、選んだ牛の記録を残します。'}</Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {loading && <Typography>読み込み中...</Typography>}
      {!loading && !ready && !locked && <Button variant="outlined" onClick={() => setReload(value => value + 1)}>再読み込み</Button>}
      {!loading && ready && (
        <Card><CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            {!isFarm && <>
              <Autocomplete
                options={options}
                value={selectedAnimal}
                disabled={saving || locked}
                getOptionLabel={animalLabel}
                isOptionEqualToValue={(left, right) => left.kind === right.kind && String(left.animal.id) === String(right.animal.id)}
                noOptionsText="該当する牛がいません"
                onChange={(_event, selected) => {
                  if (sync.attemptRef.current?.busy || locked) return;
                  setSelectedAnimal(selected);
                  setForm(previous => ({ ...previous, ...(selected ? activityAnimalFields(selected.kind, selected.animal) : emptyAnimal) }));
                }}
                renderOption={(props, option) => <Box component="li" {...props} key={`${option.kind}:${option.animal.id}`}>{animalLabel(option)}</Box>}
                renderInput={inputProps => <TextField {...inputProps} label="対象牛" helperText="名号・耳標番号で検索して選択できます。" />}
              />
              {mode === 'edit' && !selectedAnimal && form.animalKind && <Typography variant="body2" color="text.secondary">
                記録時の対象：{form.animalName || '名号未登録'}（{storedAnimalNumber(form)}）。対象を選び直さなければ、この個体情報を保持します。
              </Typography>}
            </>}
            <Grid container>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label={isFarm ? '作業日' : '記録日'} type="date" value={form.recordDate} onChange={event => update('recordDate', event.target.value)} InputLabelProps={{ shrink: true }} required fullWidth disabled={saving || locked} />
              </Grid>
            </Grid>
            <TextField label={isFarm ? '作業内容' : '記録内容'} value={form.title} onChange={event => update('title', event.target.value)}
              placeholder={isFarm ? '例：牛舎の清掃・敷料交換' : '例：食欲良好、歩き方に変化なし'} required multiline minRows={2} fullWidth disabled={saving || locked} />
            <TextField label="メモ" value={form.note} onChange={event => update('note', event.target.value)} multiline minRows={3} fullWidth disabled={saving || locked} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button type="submit" variant="contained" size="large" disabled={saving || locked} fullWidth>{saving ? '保存中...' : `${label}を保存`}</Button>
              <Button component={RouterLink} to={returnTo} variant="outlined" size="large" disabled={saving} fullWidth>戻る</Button>
            </Stack>
          </Stack>
        </CardContent></Card>
      )}
    </Stack>
  );
}
