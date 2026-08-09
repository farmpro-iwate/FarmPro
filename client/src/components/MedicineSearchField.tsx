import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { createMaster, getMasterList } from '../services/masterApi';
import { isUnregisteredMasterName } from './masterInputUtils';

export type MedicineOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
  meatWithdrawalDays?: number;
  milkWithdrawalHours?: number;
  withdrawalNote?: string;
  autoCalculateWithdrawal?: boolean;
};

type Props = {
  value: string;
  onChange: (name: string, medicine?: MedicineOption | null) => void;
  required?: boolean;
};

export function MedicineSearchField({ value, onChange, required = false }: Props) {
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newMedicineName, setNewMedicineName] = useState('');
  const [newMedicineCode, setNewMedicineCode] = useState('');
  const [newMedicineNote, setNewMedicineNote] = useState('');
  const [newMeatWithdrawalDays, setNewMeatWithdrawalDays] = useState('');
  const [newMilkWithdrawalHours, setNewMilkWithdrawalHours] = useState('');
  const [newWithdrawalNote, setNewWithdrawalNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadMedicines() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('medicine');
        setMedicines(
          masters
            .filter((master) => master.active)
            .map((master) => ({
              id: master.id,
              name: master.name,
              code: master.code,
              note: master.note,
              meatWithdrawalDays: master.meatWithdrawalDays,
              milkWithdrawalHours: master.milkWithdrawalHours,
              withdrawalNote: master.withdrawalNote,
              autoCalculateWithdrawal: master.autoCalculateWithdrawal
            }))
        );
      } catch (err) {
        setError('薬品・ワクチンマスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadMedicines();
  }, []);

  const selectedMedicine = medicines.find((medicine) => medicine.name === value) || null;

  async function handleCreate() {
    const name = newMedicineName.trim();
    if (!name) {
      setError('薬品・ワクチン名を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const meatDays = newMeatWithdrawalDays === '' ? undefined : Number(newMeatWithdrawalDays);
      const milkHours = newMilkWithdrawalHours === '' ? undefined : Number(newMilkWithdrawalHours);
      const created = await createMaster({
        category: 'medicine',
        name,
        code: newMedicineCode.trim() || undefined,
        note: newMedicineNote.trim() || undefined,
        meatWithdrawalDays: Number.isFinite(meatDays) ? meatDays : undefined,
        milkWithdrawalHours: Number.isFinite(milkHours) ? milkHours : undefined,
        withdrawalNote: newWithdrawalNote.trim() || undefined,
        autoCalculateWithdrawal: true
      });

      const option: MedicineOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note,
        meatWithdrawalDays: created.meatWithdrawalDays,
        milkWithdrawalHours: created.milkWithdrawalHours,
        withdrawalNote: created.withdrawalNote,
        autoCalculateWithdrawal: created.autoCalculateWithdrawal
      };

      setMedicines((prev) => [...prev, option]);
      onChange(created.name, option);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : '薬品・ワクチンの登録に失敗しました');
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function closeDialog() {
    if (creating) return;
    setOpenDialog(false);
    setNewMedicineName('');
    setNewMedicineCode('');
    setNewMedicineNote('');
    setNewMeatWithdrawalDays('');
    setNewMilkWithdrawalHours('');
    setNewWithdrawalNote('');
    setError('');
  }

  function openCreateDialog() {
    setError('');
    setNewMedicineName(value.trim());
    setOpenDialog(true);
  }

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            loading={loading}
            options={medicines}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedMedicine}
            inputValue={value}
            onInputChange={(_, newInputValue, reason) => {
              if (reason === 'input' || reason === 'clear') onChange(newInputValue, null);
            }}
            onChange={(_, newValue) => {
              if (!newValue) {
                onChange('', null);
                return;
              }
              if (typeof newValue === 'string') {
                onChange(newValue, null);
                return;
              }
              onChange(newValue.name, newValue);
            }}
            onClose={(_, reason) => {
              if (reason === 'blur' && isUnregisteredMasterName(value, medicines)) {
                openCreateDialog();
              }
            }}
            filterOptions={(options, state) => {
              const query = state.inputValue.trim().toLowerCase();
              if (!query) return options;
              return options.filter(
                (option) =>
                  option.name.toLowerCase().includes(query) ||
                  Boolean(option.code?.toLowerCase().includes(query)) ||
                  Boolean(option.note?.toLowerCase().includes(query))
              );
            }}
            freeSolo
            renderInput={(params) => (
              <TextField {...params} label="使用薬剤／ワクチン" placeholder="薬品名・ワクチン名またはコードで検索..." required={required} fullWidth />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ py: 1.25, minWidth: 0, '& *': { wordBreak: 'break-word' } }}>
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>{option.name}</Typography>
                  {option.code && <Typography variant="caption" color="text.secondary">コード：{option.code}</Typography>}
                  {option.meatWithdrawalDays !== undefined && <Typography variant="caption" color="text.secondary">肉・出荷：{option.meatWithdrawalDays}日</Typography>}
                  {option.milkWithdrawalHours !== undefined && <Typography variant="caption" color="text.secondary">乳：{option.milkWithdrawalHours}時間</Typography>}
                  {option.note && <Typography variant="caption" color="text.secondary">{option.note}</Typography>}
                </Stack>
              </Box>
            )}
            noOptionsText={loading ? <CircularProgress size={20} /> : '候補がありません。右の新規登録から追加できます'}
          />
        </Box>

        <Button type="button" variant="contained" startIcon={<AddIcon />} onMouseDown={(event) => event.preventDefault()} onClick={openCreateDialog} sx={{ mt: { xs: 0, sm: 0.5 }, whiteSpace: 'nowrap', py: 1.25, width: { xs: '100%', sm: 'auto' } }}>
          新規登録
        </Button>
      </Stack>

      {error && !openDialog && <Alert severity="error">{error}</Alert>}

      {selectedMedicine && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1, minWidth: 0, wordBreak: 'break-word' }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>✓ {selectedMedicine.name}</Typography>
          {selectedMedicine.code && <Typography sx={{ mt: 0.5 }}>コード：{selectedMedicine.code}</Typography>}
          {selectedMedicine.meatWithdrawalDays !== undefined && <Typography sx={{ mt: 0.5 }}>肉・出荷の制限期間：{selectedMedicine.meatWithdrawalDays}日</Typography>}
          {selectedMedicine.milkWithdrawalHours !== undefined && <Typography>乳の制限期間：{selectedMedicine.milkWithdrawalHours}時間</Typography>}
          {selectedMedicine.withdrawalNote && <Typography color="text.secondary">休薬メモ：{selectedMedicine.withdrawalNote}</Typography>}
          {selectedMedicine.note && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{selectedMedicine.note}</Typography>}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { m: 1, width: 'calc(100% - 16px)' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>薬品・ワクチンを新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の治療記録は保持されます。休薬情報は製品表示や獣医師の指示を確認して登録してください。</Alert>
            <TextField label="薬品・ワクチン名 *" value={newMedicineName} onChange={(event) => setNewMedicineName(event.target.value)} placeholder="例：抗生剤、解熱剤、5種混合ワクチン" autoFocus fullWidth disabled={creating} />
            <TextField label="コード（任意）" value={newMedicineCode} onChange={(event) => setNewMedicineCode(event.target.value)} placeholder="例：AB-01" fullWidth disabled={creating} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField label="肉・出荷の制限期間（日）" type="number" value={newMeatWithdrawalDays} onChange={(event) => setNewMeatWithdrawalDays(event.target.value)} inputProps={{ min: 0 }} fullWidth disabled={creating} />
              <TextField label="乳の制限期間（時間）" type="number" value={newMilkWithdrawalHours} onChange={(event) => setNewMilkWithdrawalHours(event.target.value)} inputProps={{ min: 0 }} fullWidth disabled={creating} />
            </Stack>
            <TextField label="休薬・使用禁止の注意事項" value={newWithdrawalNote} onChange={(event) => setNewWithdrawalNote(event.target.value)} placeholder="例：製品表示・獣医師指示を優先" multiline minRows={2} fullWidth disabled={creating} />
            <TextField label="備考（任意）" value={newMedicineNote} onChange={(event) => setNewMedicineNote(event.target.value)} placeholder="例：用法、対象疾病、メーカーなど" multiline minRows={2} fullWidth disabled={creating} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button type="button" onClick={closeDialog} disabled={creating}>キャンセル</Button>
          <Button type="button" variant="contained" onClick={handleCreate} disabled={creating || !newMedicineName.trim()}>{creating ? <CircularProgress size={20} /> : '登録'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
