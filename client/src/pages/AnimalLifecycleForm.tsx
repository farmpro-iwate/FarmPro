import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getCattleList, updateCattleLifecycle } from '../services/api';
import { getCalfList, updateCalfLifecycle } from '../services/calfApi';
import { getSalesList, type SaleRecord } from '../services/salesApi';
import { assertAnimalSyncContext, getAnimalSyncContext } from '../services/animalRecordSyncSafety';
import type { Cattle } from '../types/cattle';
import type { Calf } from '../types/calf';
import type { AnimalLifecycleChange } from '../types/animalLifecycle';
import { isAnimalDeceased } from '../utils/animalLifecycle';
import { localCattlePlanToday, planAnimalMatch } from '../utils/cattleBreedingPlans';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { useFeedingFatteningFormAttempt } from './feedingFatteningPageSync';

type AnimalOption = { kind: 'cattle'; animal: Cattle } | { kind: 'calf'; animal: Calf };
type SavedAnimal = AnimalOption & { warning: string };

function animalNumber(option: AnimalOption) {
  const raw = option.kind === 'calf' ? option.animal.calfNumber : option.animal.earTag;
  return option.kind === 'calf' && isTemporaryCalfNumber(raw)
    ? `仮番号 ${formatTemporaryCalfNumber(raw, option.animal.birthday)}`
    : raw ? `耳標 ${raw}` : '耳標未登録';
}
function animalLabel(option: AnimalOption) {
  const kind = option.kind === 'calf' ? '子牛' : option.animal.stage || '繁殖牛';
  const state = isAnimalDeceased(option.animal) ? '・死亡履歴' : option.animal.lifecycle?.culling ? '・廃用' : '';
  return `${option.animal.name || '名号未登録'}（${animalNumber(option)}）・${kind}${state}`;
}
function animalPath(option: AnimalOption) {
  return `/${option.kind === 'calf' ? 'calves' : 'cattle'}/${option.animal.id}`;
}
function isSold(option: AnimalOption, sales: SaleRecord[]) {
  if (option.kind === 'calf' && option.animal.managementStatus === '販売済み') return true;
  return sales.some(sale => {
    if ((sale as SaleRecord & { deletedAt?: string }).deletedAt || sale.status !== '販売済み' || sale.targetType !== (option.kind === 'calf' ? '子牛' : '成牛')) return false;
    if (option.kind === 'cattle') return planAnimalMatch(sale, option.animal) === 'match';
    const calf = option.animal;
    if (sale.birthday && calf.birthday && sale.birthday.slice(0, 10) !== calf.birthday.slice(0, 10)) return false;
    const tag = String(sale.targetNumber || '').trim();
    if (tag) return tag === String(calf.calfNumber || '').trim();
    return Boolean(sale.calfId && String(sale.calfId) === String(calf.id));
  });
}
function isPromoted(option: AnimalOption) {
  return option.kind === 'calf' && (option.animal.managementStatus === '牛台帳へ移行済み' || Boolean(option.animal.promotedCattleId));
}
function initialChange(option: AnimalOption | null, type: 'death' | 'culling'): AnimalLifecycleChange {
  const entry = option?.animal.lifecycle?.[type];
  return { type, date: entry?.date || localCattlePlanToday(), reason: entry?.reason || '', note: entry?.note || '',
    route: option?.animal.lifecycle?.culling?.route || 'fattening' };
}
function followupPath(option: AnimalOption, action: 'fattening' | 'sale') {
  const animal = option.animal;
  const number = option.kind === 'calf' ? option.animal.calfNumber : option.animal.earTag;
  const params = new URLSearchParams({ targetNumber: number, targetName: animal.name, returnTo: animalPath(option) });
  if (action === 'fattening') return `/fattening-transitions/new?${params}`;
  params.set('source', option.kind);
  params.set('targetType', option.kind === 'calf' ? '子牛' : '成牛');
  params.set(option.kind === 'calf' ? 'calfId' : 'cattleId', String(animal.id));
  params.set('birthday', animal.birthday);
  params.set('sex', animal.sex);
  if (option.kind === 'calf') {
    params.set('motherName', option.animal.motherName);
    if (isTemporaryCalfNumber(number)) params.set('targetNumber', '');
  }
  return `/sales/new?${params}`;
}

export function AnimalLifecycleForm() {
  const [params] = useSearchParams();
  const [options, setOptions] = useState<AnimalOption[]>([]);
  const [selected, setSelected] = useState<AnimalOption | null>(null);
  const [form, setForm] = useState<AnimalLifecycleChange>(() => initialChange(null, params.get('type') === 'culling' ? 'culling' : 'death'));
  const [saved, setSaved] = useState<SavedAnimal | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const sync = useFeedingFatteningFormAttempt(getAnimalSyncContext, assertAnimalSyncContext);
  const { saving, locked, error } = sync;
  const isDeath = form.type === 'death';
  const returnTo = params.get('returnTo');
  const backPath = returnTo && /^\/(?:cattle|calves)(?:\/\d+)?$/.test(returnTo)
    ? returnTo : selected ? animalPath(selected) : '/cattle';

  useEffect(() => {
    const attempt = sync.attemptRef.current;
    if (!attempt) return;
    let active = true;
    setLoading(true); setReady(false); setSaved(null); setSelected(null); setOptions([]);
    setForm(initialChange(null, params.get('type') === 'culling' ? 'culling' : 'death'));
    sync.setError('');
    void Promise.all([getCattleList(), getCalfList(), getSalesList()]).then(([cattle, calves, sales]) => {
      sync.assertAttempt(attempt);
      if (!active) return;
      const all: AnimalOption[] = [
        ...cattle.map(animal => ({ kind: 'cattle' as const, animal })),
        ...calves.map(animal => ({ kind: 'calf' as const, animal })),
      ];
      const available = all.filter(option => !isSold(option, sales) && !isPromoted(option));
      setOptions(available);
      const requestedId = params.get('animalId');
      const requestedKind = params.get('animalKind');
      if (requestedId && (requestedKind === 'cattle' || requestedKind === 'calf')) {
        const found = available.find(option => option.kind === requestedKind && String(option.animal.id) === requestedId);
        if (!found) sync.setError('対象牛が在籍台帳に見つかりません。販売済み・牛台帳へ移行済みの場合は、現在の台帳を確認してください。');
        else {
          setSelected(found);
          const requestedType = params.get('type');
          const type = requestedType === 'culling' ? 'culling' : requestedType === 'death' ? 'death'
            : found.animal.lifecycle?.death ? 'death' : found.animal.lifecycle?.culling ? 'culling' : 'death';
          setForm(initialChange(found, type));
        }
      }
      setReady(true);
    }).catch(cause => { if (active) sync.showFailure(attempt, cause, '対象牛を読み込めませんでした。'); })
      .finally(() => { if (active && sync.isCurrentAttempt(attempt)) setLoading(false); });
    return () => { active = false; };
  }, [sync.routeKey, reload]);

  function update<K extends keyof AnimalLifecycleChange>(key: K, value: AnimalLifecycleChange[K]) {
    if (sync.attemptRef.current?.busy || locked || saved) return;
    setForm(previous => ({ ...previous, [key]: value }));
  }
  async function handleSave(event?: React.FormEvent) {
    event?.preventDefault();
    if (!ready || loading) return;
    const attempt = sync.beginSaving();
    if (!attempt) return;
    try {
      sync.assertAttempt(attempt);
      if (!selected) throw new Error('対象牛を台帳から選択してください。');
      if (!form.date || !form.reason.trim()) throw new Error('日付と理由を入力してください。');
      const sales = await getSalesList();
      sync.assertAttempt(attempt);
      if (isSold(selected, sales) || isPromoted(selected)) throw new Error('販売済み・牛台帳へ移行済みの牛は処理できません。現在の台帳を確認してください。');
      const payload = { ...form, reason: form.reason.trim(), note: form.note.trim() };
      const updated = selected.kind === 'cattle'
        ? await updateCattleLifecycle(String(selected.animal.id), payload, selected.animal.lifecycle, selected.animal)
        : await updateCalfLifecycle(String(selected.animal.id), payload, selected.animal.lifecycle, selected.animal);
      sync.assertAttempt(attempt);
      const next = { kind: selected.kind, animal: updated } as AnimalOption;
      setSelected(next);
      setOptions(previous => previous.map(option => option.kind === next.kind && option.animal.id === next.animal.id ? next : option));
      setSaved({ ...next, warning: attempt.context.cloudEnabled && updated.cloudSyncPending ? updated.syncWarning || 'この端末に保存済みです。クラウドへの反映を確認できていません。' : '' });
    } catch (cause) { sync.showFailure(attempt, cause, '死亡・廃用の記録を保存できませんでした。'); }
    finally { sync.finishSaving(attempt); }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>死亡・廃用を記録</Typography>
      {error && <Alert severity="warning">{error}</Alert>}
      {loading && <Typography>読み込み中...</Typography>}
      {!loading && !ready && !locked && <Button variant="outlined" onClick={() => setReload(value => value + 1)}>再読み込み</Button>}
      {!loading && ready && <Card><CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack component="form" spacing={2} onSubmit={handleSave}>
          <Autocomplete options={options} value={selected} disabled={saving || locked || Boolean(saved)}
            getOptionLabel={animalLabel} isOptionEqualToValue={(a, b) => a.kind === b.kind && a.animal.id === b.animal.id}
            noOptionsText="該当する牛がいません"
            onChange={(_event, option) => {
              if (sync.attemptRef.current?.busy || locked || saved) return;
              setSelected(option);
              setForm(initialChange(option, option?.animal.lifecycle?.death ? 'death' : form.type));
            }}
            renderOption={(props, option) => <Box component="li" {...props} key={`${option.kind}:${option.animal.id}`}>{animalLabel(option)}</Box>}
            renderInput={inputProps => <TextField {...inputProps} label="対象牛" helperText="名号・耳標番号で検索し、対象を確認してください。" />} />
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField select label="処理区分" value={form.type} disabled={saving || locked || Boolean(saved)} fullWidth
                onChange={event => {
                  if (sync.attemptRef.current?.busy || locked || saved) return;
                  setForm(initialChange(selected, event.target.value as 'death' | 'culling'));
                }}>
                <MenuItem value="death">死亡</MenuItem>
                <MenuItem value="culling" disabled={Boolean(selected && isAnimalDeceased(selected.animal) && !selected.animal.lifecycle?.culling)}>廃用（繁殖終了）</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label={isDeath ? '死亡日' : '廃用決定日'} type="date" value={form.date}
                onChange={event => update('date', event.target.value)} required fullWidth InputLabelProps={{ shrink: true }}
                inputProps={{ max: localCattlePlanToday(), min: selected?.animal.birthday || undefined }} disabled={saving || locked || Boolean(saved)} />
            </Grid>
          </Grid>
          {!isDeath && <TextField select label="廃用後の飼養" value={form.route || 'fattening'} fullWidth disabled={saving || locked || Boolean(saved)}
            onChange={event => update('route', event.target.value as 'fattening' | 'sale')}>
            <MenuItem value="fattening">農場で肥育を続ける</MenuItem>
            <MenuItem value="sale">出荷・販売を待つ</MenuItem>
          </TextField>}
          <TextField label={isDeath ? '死亡理由' : '廃用理由'} value={form.reason} onChange={event => update('reason', event.target.value)}
            required multiline minRows={2} fullWidth disabled={saving || locked || Boolean(saved)} />
          <TextField label="メモ" value={form.note} onChange={event => update('note', event.target.value)}
            multiline minRows={2} fullWidth disabled={saving || locked || Boolean(saved)} />
          <Alert severity="info">
            {isDeath ? '死亡日を記録し、在籍頭数・今後の予定とアラートの対象から外します。過去の台帳と記録は残ります。'
              : '繁殖対象から外し、農場にいる間は在籍頭数に残します。治療・飼養の記録は続けられます。出荷・販売は別途登録します。'}
          </Alert>
          {saved ? <>
            <Alert severity="success">{isDeath ? '死亡' : '廃用'}の記録を保存しました。{saved.animal.name || '名号未登録'}（{animalNumber(saved)}）</Alert>
            {saved.warning && <Alert severity="warning" action={<Button color="inherit" size="small" disabled={saving || locked} onClick={() => void handleSave()}>同期を再試行</Button>}>{saved.warning}</Alert>}
            {!isDeath && !isAnimalDeceased(saved.animal) && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              {form.route === 'fattening' && <Button component={RouterLink} to={followupPath(saved, 'fattening')} variant="outlined" disabled={saving || locked}>続けて肥育移行を登録</Button>}
              <Button component={RouterLink} to={followupPath(saved, 'sale')} variant="outlined" disabled={saving || locked}>続けて出荷・販売を登録</Button>
            </Stack>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={RouterLink} to={animalPath(saved)} variant="contained" disabled={saving || locked}>個体カルテを確認</Button>
              <Button variant="text" disabled={saving || locked} onClick={() => setSaved(null)}>日付・理由を修正</Button>
            </Stack>
          </> : <Button type="submit" variant="contained" size="large" disabled={saving || locked}>{saving ? '保存中...' : `${isDeath ? '死亡' : '廃用'}として記録`}</Button>}
          <Button component={RouterLink} to={backPath} variant="text" disabled={saving}>戻る</Button>
        </Stack>
      </CardContent></Card>}
    </Stack>
  );
}
