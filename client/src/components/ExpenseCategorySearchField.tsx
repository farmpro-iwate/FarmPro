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

type ExpenseCategoryOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function ExpenseCategorySearchField({ value, masterId, onChange, required = false }: Props) {
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('expenseCategory');
        setCategories(
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
        setError('経費科目マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadCategories();
  }, []);

  const selectedCategory =
    categories.find((item) => item.id === masterId) ||
    categories.find((item) => item.name === value) ||
    null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError('経費科目名を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'expenseCategory',
        name,
        code: newCode.trim() || undefined,
        note: newNote.trim() || undefined
      });

      const option: ExpenseCategoryOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };

      setCategories((prev) => [...prev, option]);
      onChange(created.name, created.id);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : '経費科目の登録に失敗しました');
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
            options={categories}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedCategory}
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
                label="経費科目"
                placeholder="科目名またはコードで検索..."
                required={required}
                fullWidth
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ py: 1.25, minWidth: 0, '& *': { wordBreak: 'break-word' } }}>
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
          sx={{ mt: { xs: 0, sm: 0.5 }, whiteSpace: 'nowrap', py: 1.25, width: { xs: '100%', sm: 'auto' } }}
        >
          新規登録
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {selectedCategory && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1, minWidth: 0, wordBreak: 'break-word' }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selectedCategory.name}
          </Typography>
          {selectedCategory.code && <Typography sx={{ mt: 0.5 }}>コード：{selectedCategory.code}</Typography>}
          {selectedCategory.note && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedCategory.note}
            </Typography>
          )}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { m: 1, width: 'calc(100% - 16px)' } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>経費科目を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の経費内容は保持されます。</Alert>
            <TextField
              label="科目名 *"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例：飼料代、燃料代、人工授精料"
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="例：EXP-001"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="例：月次で発生、年契約など"
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
