import { useEffect, useId, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  InputAdornment, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import type { SupplyBatch } from '../services/supplyInventoryApi';

type MedicineSource = '' | 'farm_stock' | 'veterinarian';
type Props = {
  medicine: string;
  source: MedicineSource;
  batches: SupplyBatch[];
  selectedKey?: string;
  quantity?: number;
  loading: boolean;
  error: string;
  syncWarning?: string;
  disabled?: boolean;
  onSourceChange: (source: MedicineSource) => void;
  onReload: () => void;
  onSelectBatch: (batch: SupplyBatch | null) => void;
  onQuantityChange: (quantity: number | undefined) => void;
};

const touchButton = { minHeight: 44, minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' } as const;
const inventoryUrl = '/supply-inventory?kind=医薬品';
const hasStock = (batch: SupplyBatch) => Number.isFinite(batch.balance) && batch.balance > 0;
const searchText = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();

function batchLabel(batch: SupplyBatch) {
  return `${batch.itemName}（${batch.lotNumber.trim() || 'ロット未入力'}）`;
}

function BatchDescription({ batch }: { batch: SupplyBatch }) {
  const balance = Number.isFinite(batch.balance) ? String(batch.balance) : '要確認';
  return <Stack spacing={0.25} sx={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
    <Typography component="span" fontWeight={700}>{batch.itemName}</Typography>
    <Typography component="span" variant="body2">
      {batch.lotNumber.trim() ? `ロット：${batch.lotNumber}` : 'ロット未入力'} ／ 残り {balance} {batch.unit.trim() || '単位未入力'}
    </Typography>
    <Typography component="span" variant="body2" color="text.secondary">保管場所：{batch.storageLocation.trim() || '未入力'}</Typography>
  </Stack>;
}

/** Controlled stock fields only. The parent owns data loading, treatment input and saving. */
export function TreatmentMedicineStockFields({
  medicine, source, batches, selectedKey, quantity, loading, error, syncWarning,
  disabled = false, onSourceChange, onReload, onSelectBatch, onQuantityChange,
}: Props) {
  const dialogTitleId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState('');
  const [pickerContext, setPickerContext] = useState('');
  const [pickerError, setPickerError] = useState('');
  const name = medicine.trim();
  const contextKey = JSON.stringify([name, source, selectedKey || '']);
  const locked = disabled || loading || Boolean(error);
  const medicineBatches = useMemo(() => batches.filter(batch => batch.kind === '医薬品'), [batches]);
  const matches = useMemo(() => medicineBatches.filter(batch => batch.itemName.trim() === name), [medicineBatches, name]);
  const choices = useMemo(() => matches.filter(batch => hasStock(batch) || batch.key === selectedKey), [matches, selectedKey]);
  const available = useMemo(() => medicineBatches.filter(hasStock), [medicineBatches]);
  const selectedBatch = medicineBatches.find(batch => batch.key === selectedKey);
  const selectedMatchesMedicine = Boolean(selectedBatch && selectedBatch.itemName.trim() === name);
  const selectedInChoices = choices.some(batch => batch.key === selectedKey);
  const unit = selectedBatch?.unit.trim() || '';
  const pendingBatch = available.find(batch => batch.key === pendingKey) || null;
  const matchingContext = pickerContext === contextKey;
  const changesMedicine = Boolean(pendingBatch && pendingBatch.itemName.trim() !== name);
  const canUsePending = Boolean(pendingBatch && matchingContext && source === 'farm_stock' && !locked);

  useEffect(() => {
    if (pickerOpen && pickerContext !== contextKey) {
      setPickerOpen(false);
      setPendingKey('');
      setPickerError('');
    }
  }, [pickerOpen, pickerContext, contextKey]);

  function openPicker() {
    if (locked || source !== 'farm_stock' || !available.length) return;
    setPendingKey('');
    setPickerError('');
    setPickerContext(contextKey);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setPendingKey('');
    setPickerError('');
  }

  function applyPending() {
    if (locked || !matchingContext || source !== 'farm_stock') return;
    // Re-resolve against the current props so a reload cannot apply an old stock snapshot.
    const current = batches.find(batch => batch.key === pendingKey && batch.kind === '医薬品' && hasStock(batch));
    if (!current) return;
    try {
      onSelectBatch(current);
      closePicker();
    } catch (caught) {
      setPickerError(caught instanceof Error ? caught.message : '使用する在庫を確認してください。');
    }
  }

  let emptyMessage = '';
  if (!loading && !error) {
    if (!medicineBatches.length) emptyMessage = '選択できる医薬品の在庫がありません。「医薬品在庫を開く」で登録内容を確認してください。';
    else if (!name) emptyMessage = '薬剤名を入力するか、「在庫から薬を選び直す」で薬を選んでください。';
    else if (!matches.length) emptyMessage = `「${name}」と同じ薬品名の在庫がありません。在庫の登録名を確認してください。`;
    else if (!matches.some(hasStock)) emptyMessage = matches.some(batch => !Number.isFinite(batch.balance))
      ? '同じ薬品名の在庫はありますが、残量を確認できません。医薬品在庫で確認してください。'
      : '同じ薬品名の在庫はありますが、使用できる残量がありません。選択済みの場合は使用数量を確認してください。';
  }

  return <Stack spacing={1.5} sx={{ minWidth: 0, width: '100%', '& .MuiFormControl-root': { minWidth: 0 } }}>
    <TextField select label="薬剤の使用元" value={source} fullWidth disabled={disabled}
      InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
      onChange={event => { if (!disabled) onSourceChange(event.target.value as MedicineSource); }}>
      <MenuItem value="" sx={touchButton}>選択してください</MenuItem>
      <MenuItem value="farm_stock" sx={touchButton}>農場在庫から使用</MenuItem>
      <MenuItem value="veterinarian" sx={touchButton}>獣医師が処方・持参</MenuItem>
    </TextField>

    {source === 'farm_stock' && <>
      {loading && <Stack spacing={1}><Typography role="status">医薬品在庫を読み込んでいます…</Typography><LinearProgress aria-label="医薬品在庫を読み込み中" /></Stack>}
      {!loading && error && <Alert severity="error" sx={{ overflowWrap: 'anywhere' }}>{error}</Alert>}
      {syncWarning && <Alert severity="warning" sx={{ overflowWrap: 'anywhere' }}>{syncWarning}</Alert>}
      {emptyMessage && <Alert severity="info" sx={{ overflowWrap: 'anywhere' }}>{emptyMessage}</Alert>}
      {!loading && !error && selectedKey && !selectedBatch && <Alert severity="warning">
        選択中の在庫を取得した一覧で確認できません。再読み込みして、使用する在庫を確認してください。
      </Alert>}
      {!loading && !error && selectedBatch && !selectedMatchesMedicine && <Alert severity="warning">
        選択中の在庫と入力した薬剤名が一致していません。「在庫から薬を選び直す」で確認してください。
      </Alert>}

      <TextField select label="使用する在庫・ロット" value={selectedKey || ''} fullWidth
        disabled={locked || !choices.length || !name} InputLabelProps={{ shrink: true }}
        SelectProps={{
          displayEmpty: true,
          renderValue: value => value
            ? selectedBatch ? <BatchDescription batch={selectedBatch} /> : '選択中の在庫（要再確認）'
            : '在庫を選択',
          MenuProps: { PaperProps: { sx: { maxWidth: 'calc(100vw - 24px)' } } },
        }}
        sx={{ '& .MuiSelect-select': { whiteSpace: 'normal', overflowWrap: 'anywhere', minWidth: 0 } }}
        onChange={event => {
          if (locked) return;
          const key = event.target.value;
          if (!key) { onSelectBatch(null); return; }
          const current = choices.find(batch => batch.key === key);
          if (current) onSelectBatch(current);
        }}>
        <MenuItem value="" sx={touchButton}>在庫を選択</MenuItem>
        {selectedKey && !selectedInChoices && <MenuItem value={selectedKey} disabled sx={touchButton}>
          {selectedBatch ? <BatchDescription batch={selectedBatch} /> : '選択中の在庫（要再確認）'}
        </MenuItem>}
        {choices.map(batch => <MenuItem key={batch.key} value={batch.key} sx={touchButton}>
          <BatchDescription batch={batch} />
        </MenuItem>)}
      </TextField>

      <TextField label="在庫からの使用数量" type="number" value={quantity ?? ''} fullWidth
        disabled={locked || !selectedMatchesMedicine || !unit}
        InputProps={{ endAdornment: unit ? <InputAdornment position="end">{unit}</InputAdornment> : undefined }}
        inputProps={{ min: 0.001, step: 'any', inputMode: 'decimal' }}
        helperText={unit ? `在庫の単位は「${unit}」です。この単位で使用数量を入力してください。` : '在庫・ロットを選び、単位を確認してから使用数量を入力してください。'}
        onChange={event => {
          if (locked || !selectedMatchesMedicine || !unit) return;
          onQuantityChange(event.target.value.trim() === '' ? undefined : Number(event.target.value));
        }} />

      <Button type="button" variant="outlined" onClick={openPicker} disabled={locked || !available.length} sx={touchButton}>
        在庫から薬を選び直す
      </Button>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ minWidth: 0 }}>
        <Button type="button" variant="outlined" disabled={loading || disabled} sx={touchButton}
          onClick={() => { if (!loading && !disabled) onReload(); }}>在庫を再読み込み</Button>
        <Button component="a" href={inventoryUrl} target="_blank" rel="noopener" variant="outlined" disabled={disabled} sx={touchButton}>
          医薬品在庫を開く
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">治療の入力を残したまま、新しいタブで医薬品在庫を開きます。</Typography>
    </>}

    {source === 'veterinarian' && <Alert severity="info">農場在庫は減らしません。</Alert>}

    <Dialog open={pickerOpen} onClose={closePicker} aria-labelledby={dialogTitleId} fullWidth maxWidth="sm"
      PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' }, maxHeight: 'calc(100% - 32px)' } }}>
      <DialogTitle id={dialogTitleId} fontWeight={800}>在庫から薬を選び直す</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, minWidth: 0, overflowX: 'hidden', overflowWrap: 'anywhere' }}>
        <Stack spacing={2}>
          <Typography>残量のある医薬品在庫から、薬とロットを選んでください。</Typography>
          <Typography variant="body2">入力中の薬剤：{name || '未入力'}</Typography>
          {loading && <Typography role="status">在庫を読み込んでいます。完了してから確認してください。</Typography>}
          {error && <Alert severity="error">{error}</Alert>}
          {pickerError && <Alert severity="error">{pickerError}</Alert>}
          {!loading && !error && !available.length && <Alert severity="info">残量のある医薬品在庫がありません。</Alert>}
          <Autocomplete<SupplyBatch> disablePortal options={available} value={pendingBatch}
            disabled={locked || !matchingContext} autoHighlight={false} autoSelect={false}
            getOptionLabel={batchLabel} isOptionEqualToValue={(option, value) => option.key === value.key}
            filterOptions={(options, state) => {
              const words = searchText(state.inputValue).split(/\s+/).filter(Boolean);
              return options.filter(batch => {
                const text = searchText([batchLabel(batch), batch.itemName, batch.lotNumber, batch.storageLocation, batch.unit].join(' '));
                return words.every(word => text.includes(word));
              });
            }}
            onChange={(_event, batch) => {
              if (locked || !matchingContext) return;
              setPendingKey(batch?.key || '');
              setPickerError('');
            }}
            renderInput={params => <TextField {...params} label="医薬品在庫を検索" helperText="薬品名・ロット・保管場所で検索できます" fullWidth />}
            renderOption={(props, batch) => <Box component="li" {...props} key={batch.key}
              sx={{ minWidth: 0, minHeight: 44, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
              <BatchDescription batch={batch} />
            </Box>}
            noOptionsText="一致する在庫がありません。検索する文字を変えてください。"
            ListboxProps={{ sx: { '& .MuiAutocomplete-option': { minHeight: 44, whiteSpace: 'normal' } } }}
            sx={{ minWidth: 0, '& .MuiAutocomplete-clearIndicator, & .MuiAutocomplete-popupIndicator': { width: 44, height: 44 } }} />
          {pendingKey && !pendingBatch && !loading && !error && <Alert severity="warning">選んだ在庫の残量を確認できません。使用する在庫を選び直してください。</Alert>}
          {pendingBatch && <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}><BatchDescription batch={pendingBatch} /></Box>}
          {changesMedicine && <Alert severity="warning">
            薬剤名を「{pendingBatch?.itemName}」に変更します。投薬量・休薬終了日は別途確認してください。
          </Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > :not(style) ~ :not(style)': { ml: 0 }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 44 } }}>
        <Button type="button" variant="outlined" onClick={closePicker}>キャンセル</Button>
        <Button type="button" variant="contained" onClick={applyPending} disabled={!canUsePending}>この薬・在庫を使用する</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
