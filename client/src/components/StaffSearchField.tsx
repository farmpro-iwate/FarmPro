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
  label: '獣医師名' | '授精師';
};

type StaffOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function StaffSearchField({ value, onChange, label }: Props) {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadStaff() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('staff');
        setStaff(
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
        setError('獣医師・授精師マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadStaff();
  }, []);

  const selected = staff.find((item) => item.name === value) || null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError('氏名を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'staff',
        name,
        code: newCode.trim() || undefined,
        note: newNote.trim() || undefined
      });
      const option: StaffOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };
      setStaff((prev) => [...prev, option]);
      onChange(created.name);
      setOpenDialog(false);
      setNewName('');
      setNewCode('');
      setNewNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
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
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Autocomplete
            loading={loading}
            options={staff}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selected}
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
                label={label}
                placeholder="氏名またはコードで検索..."
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
            setNewName(value.trim());
            setOpenDialog(true);
          }}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', py: 1.25 }}
        >
          新規登録
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {selected && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1 }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selected.name}
          </Typography>
          {selected.code && <Typography sx={{ mt: 0.5 }}>コード：{selected.code}</Typography>}
          {selected.note && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{selected.note}</Typography>}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>獣医師・授精師を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力途中の内容は保持されます。</Alert>
            <TextField
              label="氏名 *"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="例：VET-01 / AI-01"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="例：獣医師、授精師、所属先など"
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
