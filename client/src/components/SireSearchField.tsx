import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { getMasterList, createMaster } from '../services/masterApi';
import { isUnregisteredMasterName } from './masterInputUtils';

type Props = {
  value: string;
  masterId?: number;
  onChange: (name: string, masterId?: number) => void;
  label?: string;
  required?: boolean;
};

type SireOption = {
  id: number;
  name: string;
  code?: string;
  earTag?: string;
  note?: string;
};

export function SireSearchField({
  value,
  masterId,
  onChange,
  label = '種雄牛',
  required = false,
}: Props) {
  const [sires, setSires] = useState<SireOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [newSireName, setNewSireName] = useState('');
  const [newSireCode, setNewSireCode] = useState('');
  const [newSireEarTag, setNewSireEarTag] = useState('');
  const [newSireNote, setNewSireNote] = useState('');
  const [creatingMaster, setCreatingMaster] = useState(false);

  useEffect(() => {
    async function loadSires() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('sire');
        setSires(
          masters
            .filter((master) => master.active)
            .map((master) => ({
              id: master.id,
              name: master.name,
              code: master.code,
              earTag: master.earTag,
              note: master.note,
            }))
        );
      } catch (err) {
        setError('種雄牛マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadSires();
  }, []);

  const selectedSire =
    sires.find((sire) => sire.id === masterId) ||
    sires.find((sire) => sire.name === value) ||
    null;

  const handleCreateMaster = async () => {
    const name = newSireName.trim();
    if (!name) {
      setError('種雄牛名を入力してください');
      return;
    }

    setCreatingMaster(true);
    setError('');
    try {
      const created = await createMaster({
        category: 'sire',
        name,
        code: newSireCode.trim() || undefined,
        earTag: newSireEarTag.trim() || undefined,
        note: newSireNote.trim() || undefined,
      });
      const option: SireOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        earTag: created.earTag,
        note: created.note,
      };
      setSires((prev) => [...prev, option]);
      onChange(created.name, created.id);
      setOpenDialog(false);
      setNewSireName('');
      setNewSireCode('');
      setNewSireEarTag('');
      setNewSireNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
      console.error(err);
    } finally {
      setCreatingMaster(false);
    }
  };

  const closeDialog = () => {
    if (creatingMaster) return;
    setOpenDialog(false);
    setNewSireName('');
    setNewSireCode('');
    setNewSireEarTag('');
    setNewSireNote('');
    setError('');
  };

  const openCreateDialog = (name = value) => {
    setError('');
    setNewSireName(name.trim());
    setOpenDialog(true);
  };

  const handleInputBlur = (inputValue: string) => {
    if (!openDialog && isUnregisteredMasterName(inputValue, sires)) {
      openCreateDialog(inputValue);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Autocomplete
            loading={loading}
            options={sires}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedSire}
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
                  Boolean(option.earTag?.toLowerCase().includes(query))
              );
            }}
            freeSolo
            renderInput={(params) => (
              <TextField
                {...params}
                label={label}
                required={required}
                placeholder="名前またはコードで検索..."
                size="small"
                inputProps={{
                  ...params.inputProps,
                  onBlur: (event) => {
                    params.inputProps.onBlur?.(event);
                    handleInputBlur(event.currentTarget.value);
                  },
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ fontSize: '1.1rem', py: 1.5, minWidth: 0, '& *': { wordBreak: 'break-word' } }}>
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>{option.name}</Typography>
                  {option.code && <Typography variant="caption" color="text.secondary">コード：{option.code}</Typography>}
                  {option.earTag && <Typography variant="caption" color="text.secondary">耳標番号：{option.earTag}</Typography>}
                  {option.note && <Typography variant="caption" color="text.secondary">{option.note}</Typography>}
                </Stack>
              </Box>
            )}
            noOptionsText={loading ? <CircularProgress size={20} /> : '候補がありません。右の新規登録から追加できます'}
          />
        </Box>
        <Button
          type="button"
          variant="contained"
          startIcon={<AddIcon />}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => openCreateDialog()}
          sx={{
            mt: { xs: 0, sm: 0.5 },
            whiteSpace: 'nowrap',
            fontSize: '1rem',
            py: 1.25,
            width: { xs: '100%', sm: 'auto' }
          }}
        >
          新規登録
        </Button>
      </Stack>

      {error && !openDialog && <Alert severity="error">{error}</Alert>}

      {selectedSire && value && (
        <Box sx={{ p: 1.5, bgcolor: '#f5f5f5', border: '2px solid #4caf50', borderRadius: 1, mt: 1, minWidth: 0, wordBreak: 'break-word' }}>
          <Typography fontWeight={800} sx={{ fontSize: '1.2rem', color: '#1976d2', mb: 1 }}>
            ✓ {selectedSire.name}
          </Typography>
          <Stack spacing={0.75} sx={{ fontSize: '0.95rem' }}>
            {selectedSire.code && <Typography>略号：{selectedSire.code}</Typography>}
            {selectedSire.earTag && <Typography>耳標番号：{selectedSire.earTag}</Typography>}
            {selectedSire.note && <Typography color="text.secondary">備考：{selectedSire.note}</Typography>}
          </Stack>
        </Box>
      )}

      <Dialog open={openDialog} onClose={closeDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { m: 1, width: 'calc(100% - 16px)' } }}>
        <DialogTitle sx={{ fontSize: '1.3rem', fontWeight: 800 }}>種雄牛を新規登録</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ fontSize: '1rem', py: 1.5 }}>
              新しい種雄牛を登録します。種付登録画面の内容は保持されます。
            </Alert>
            <TextField label="種雄牛名 *" value={newSireName} onChange={(e) => setNewSireName(e.target.value)} placeholder="例：福之姫、安福久" fullWidth size="small" autoFocus disabled={creatingMaster} />
            <TextField label="コード（任意）" value={newSireCode} onChange={(e) => setNewSireCode(e.target.value)} placeholder="例：1234、ABC" fullWidth size="small" disabled={creatingMaster} />
            <TextField label="耳標番号（任意）" value={newSireEarTag} onChange={(e) => setNewSireEarTag(e.target.value)} placeholder="例：001、JPN123" fullWidth size="small" disabled={creatingMaster} />
            <TextField label="備考（任意）" value={newSireNote} onChange={(e) => setNewSireNote(e.target.value)} fullWidth size="small" multiline minRows={2} disabled={creatingMaster} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button type="button" onClick={closeDialog} disabled={creatingMaster}>キャンセル</Button>
          <Button type="button" onClick={handleCreateMaster} variant="contained" disabled={creatingMaster || !newSireName.trim()}>
            {creatingMaster ? <CircularProgress size={20} /> : '登録'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
