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
  masterId?: number;
  onChange: (name: string, masterId?: number) => void;
  required?: boolean;
};

type ProcedureOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function TreatmentProcedureSearchField({ value, masterId, onChange, required = false }: Props) {
  const [procedures, setProcedures] = useState<ProcedureOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadProcedures() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('treatmentProcedure');
        setProcedures(
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
        setError('処置内容マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadProcedures();
  }, []);

  const selected =
    procedures.find((item) => item.id === masterId) ||
    procedures.find((item) => item.name === value) ||
    null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError('処置内容を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'treatmentProcedure',
        name,
        code: newCode.trim() || undefined,
        note: newNote.trim() || undefined
      });

      const option: ProcedureOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };

      setProcedures((prev) => [...prev, option]);
      onChange(created.name, created.id);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : '処置内容の登録に失敗しました');
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function closeDialog() {
    if (creating) return;
    setOpenDialog(false);
    setNewName('');
    setNewCode('');
    setNewNote('');
    setError('');
  }

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            loading={loading}
            options={procedures}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selected}
            inputValue={value}
            onInputChange={(_, newInputValue, reason) => {
              if (reason === 'input' || reason === 'clear') {
                onChange(newInputValue, undefined);
              }
            }}
            onChange={(_, newValue) => {
              if (!newValue) {
                onChange('', undefined);
                return;
              }
              if (typeof newValue === 'string') {
                onChange(newValue, undefined);
                return;
              }
              onChange(newValue.name, newValue.id);
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
              <TextField
                {...params}
                label="処置内容"
                placeholder="処置内容またはコードで検索..."
                required={required}
                fullWidth
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ py: 1.25, minWidth: 0, '& *': { wordBreak: 'break-word' } }}>
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>{option.name}</Typography>
                  {option.code && <Typography variant="caption" color="text.secondary">コード：{option.code}</Typography>}
                  {option.note && <Typography variant="caption" color="text.secondary">{option.note}</Typography>}
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
            setNewName(value.trim());
            setOpenDialog(true);
          }}
          sx={{ mt: { xs: 0, sm: 0.5 }, whiteSpace: 'nowrap', py: 1.25, width: { xs: '100%', sm: 'auto' } }}
        >
          新規登録
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {selected && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1, minWidth: 0, wordBreak: 'break-word' }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selected.name}
          </Typography>
          {selected.code && <Typography sx={{ mt: 0.5 }}>コード：{selected.code}</Typography>}
          {selected.note && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{selected.note}</Typography>}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { m: 1, width: 'calc(100% - 16px)' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>処置内容を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の治療記録は保持されます。</Alert>
            <TextField
              label="処置内容 *"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例：点滴、洗浄、縫合、消炎処置"
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="例：PROC-001"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="例：処置手順メモ、再処置の目安など"
              multiline
              minRows={2}
              fullWidth
              disabled={creating}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialog} disabled={creating}>キャンセル</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <CircularProgress size={20} /> : '登録'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
