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

type PartnerOption = {
  id: number;
  name: string;
  code?: string;
  note?: string;
};

export function PartnerSearchField({ value, onChange, required = false }: Props) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newNote, setNewNote] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadPartners() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('partner');
        setPartners(
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
        setError('取引先マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadPartners();
  }, []);

  const selectedPartner = partners.find((partner) => partner.name === value) || null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError('取引先名を入力してください');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'partner',
        name,
        code: newCode.trim() || undefined,
        note: newNote.trim() || undefined
      });

      const option: PartnerOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        note: created.note
      };

      setPartners((prev) => [...prev, option]);
      onChange(created.name);
      closeDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取引先の登録に失敗しました');
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
            options={partners}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedPartner}
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
                label="販売先・購買者"
                placeholder="取引先名またはコードで検索..."
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
            setNewName(value.trim());
            setOpenDialog(true);
          }}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', py: 1.25 }}
        >
          新規登録
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {selectedPartner && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1 }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.1rem', color: '#1976d2' }}>
            ✓ {selectedPartner.name}
          </Typography>
          {selectedPartner.code && <Typography sx={{ mt: 0.5 }}>コード：{selectedPartner.code}</Typography>}
          {selectedPartner.note && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {selectedPartner.note}
            </Typography>
          )}
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>取引先を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info">入力中の出荷・販売内容は保持されます。</Alert>
            <TextField
              label="取引先名 *"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例：岩手県南家畜市場、〇〇牧場"
              autoFocus
              fullWidth
              disabled={creating}
            />
            <TextField
              label="コード（任意）"
              value={newCode}
              onChange={(event) => setNewCode(event.target.value)}
              placeholder="例：ICHIBA-01"
              fullWidth
              disabled={creating}
            />
            <TextField
              label="備考（任意）"
              value={newNote}
              onChange={(event) => setNewNote(event.target.value)}
              placeholder="例：子牛市場、飼料購入先など"
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
