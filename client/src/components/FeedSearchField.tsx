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

type FeedOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function FeedSearchField({ value, onChange, required = false }: Props) {
  const [feeds, setFeeds] = useState<FeedOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedCode, setNewFeedCode] = useState('');
  const [newFeedNote, setNewFeedNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadFeeds() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('feed');
        setFeeds(
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
        setError('飼料マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadFeeds();
  }, []);

  const selectedFeed = feeds.find((feed) => feed.name === value) || null;

  async function handleCreate() {
    const name = newFeedName.trim();
    if (!name) {
      setError('飼料名を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'feed',
        name,
        code: newFeedCode.trim() || undefined,
        note: newFeedNote.trim() || undefined
      });

      const option: FeedOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };

      setFeeds((prev) => [...prev, option]);
      onChange(created.name);
      setOpenDialog(false);
      setNewFeedName('');
      setNewFeedCode('');
      setNewFeedNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '飼料の登録に失敗しました');
      console.error(err);
    } finally {
      setCreating(false);
    }
  }

  function closeDialog() {
    if (creating) return;
    setOpenDialog(false);
    setNewFeedName('');
    setNewFeedCode('');
    setNewFeedNote('');
    setError('');
  }

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Autocomplete
            loading={loading}
            options={feeds}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedFeed}
            inputValue={value}
            onInputChange={(_, newInputValue) => onChange(newInputValue)}
            onChange={(_, newValue) => {
              if (!newValue) {
                onChange('');
                return;
              }
              if (typeof newValue === 'string') {
                onChange(newValue);
                return;
              }
              onChange(newValue.name);
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
                label="飼料名"
                placeholder="飼料名またはコードで検索..."
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
            setNewFeedName(value.trim());
            setOpenDialog(true);
          }}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', py: 1.25 }}
        >
          新規登録
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {selectedFeed && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1 }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selectedFeed.name}
          </Typography>
          {selectedFeed.code && (
            <Typography sx={{ mt: 0.5 }}>コード：{selectedFeed.code}</Typography>
          )}
          {selectedFeed.note && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedFeed.note}
            </Typography>
          )}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>飼料を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の飼料給与内容は保持されます。</Alert>
            <TextField
              label="飼料名 *"
              value={newFeedName}
              onChange={(event) => setNewFeedName(event.target.value)}
              placeholder="例：配合飼料、乾草、稲わら"
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newFeedCode}
              onChange={(event) => setNewFeedCode(event.target.value)}
              placeholder="例：HAIGO-01"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newFeedNote}
              onChange={(event) => setNewFeedNote(event.target.value)}
              placeholder="例：育成用、購入先など"
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
            disabled={creating || !newFeedName.trim()}
          >
            {creating ? <CircularProgress size={20} /> : '登録'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
