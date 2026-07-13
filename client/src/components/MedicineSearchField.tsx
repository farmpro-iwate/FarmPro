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

type Props = {
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
};

type MedicineOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function MedicineSearchField({ value, onChange, required = false }: Props) {
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newMedicineName, setNewMedicineName] = useState('');
  const [newMedicineCode, setNewMedicineCode] = useState('');
  const [newMedicineNote, setNewMedicineNote] = useState('');
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
              note: master.note
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
      const created = await createMaster({
        category: 'medicine',
        name,
        code: newMedicineCode.trim() || undefined,
        note: newMedicineNote.trim() || undefined
      });

      const option: MedicineOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };

      setMedicines((prev) => [...prev, option]);
      onChange(created.name);
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
    setError('');
  }

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
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
            onInputChange={(_, newInputValue) => onChange(newInputValue)}
            onChange={(_, newValue) => onChange(newValue ? newValue.name : '')}
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
              <TextField
                {...params}
                label="使用薬剤"
                placeholder="薬品名・ワクチン名またはコードで検索..."
                required={required}
                fullWidth
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ py: 1.25 }}>
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>{option.name}</Typography>
                  {option.code && (
                    <Typography variant="caption" color="text.secondary">
                      コード：{option.code}
                    </Typography>
                  )}
                  {option.note && (
                    <Typography variant="caption" color="text.secondary">
                      {option.note}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            noOptionsText={loading ? <CircularProgress size={20} /> : '候補がありません。右の新規登録から追加できます'}
          />
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setNewMedicineName(value.trim());
            setOpenDialog(true);
          }}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', py: 1.25 }}
        >
          新規登録
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {selectedMedicine && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1 }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selectedMedicine.name}
          </Typography>
          {selectedMedicine.code && (
            <Typography sx={{ mt: 0.5 }}>コード：{selectedMedicine.code}</Typography>
          )}
          {selectedMedicine.note && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedMedicine.note}
            </Typography>
          )}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>薬品・ワクチンを新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の治療記録は保持されます。</Alert>
            <TextField
              label="薬品・ワクチン名 *"
              value={newMedicineName}
              onChange={(event) => setNewMedicineName(event.target.value)}
              placeholder="例：抗生剤、解熱剤、5種混合ワクチン"
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newMedicineCode}
              onChange={(event) => setNewMedicineCode(event.target.value)}
              placeholder="例：AB-01"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newMedicineNote}
              onChange={(event) => setNewMedicineNote(event.target.value)}
              placeholder="例：用法、対象疾病、メーカーなど"
              multiline
              minRows={2}
              fullWidth
              disabled={creating}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialog} disabled={creating}>キャンセル</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newMedicineName.trim()}
          >
            {creating ? <CircularProgress size={20} /> : '登録'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
