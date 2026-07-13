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
import { Master } from '../types/master';

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

  // 種雄牛マスター読み込み
  useEffect(() => {
    async function loadSires() {
      setLoading(true);
      setError('');
      try {
        const masters = await getMasterList('sire');
        const activeSires = masters
          .filter((m) => m.active)
          .map((m) => ({
            id: m.id,
            name: m.name,
            code: m.code,
            earTag: m.earTag,
            note: m.note,
          }));
        setSires(activeSires);
      } catch (err) {
        setError('種雄牛マスターの読み込みに失敗しました');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSires();
  }, []);

  // 現在選択されている候補を取得
  const selectedSire = masterId ? sires.find((s) => s.id === masterId) : sires.find((s) => s.name === value);

  // 新規登録処理
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
        code: newSireCode || undefined,
        earTag: newSireEarTag || undefined,
        note: newSireNote || undefined,
      });

      // 候補一覧を更新
      const newSireOption: SireOption = {
        id: created.id,
        name: created.name,
        code: created.code,
        earTag: created.earTag,
        note: created.note,
      };
      setSires((prev) => [...prev, newSireOption]);

      // 登録した種雄牛を自動選択
      onChange(created.name, created.id);

      // ダイアログをクローズ、入力をリセット
      setOpenDialog(false);
      setNewSireName('');
      setNewSireCode('');
      setNewSireEarTag('');
      setNewSireNote('');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('登録に失敗しました');
      }
      console.error(err);
    } finally {
      setCreatingMaster(false);
    }
  };

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Autocomplete
            loading={loading}
            options={sires}
            getOptionLabel={(option) =>
              typeof option === 'string'
                ? option
                : `${option.name}${option.code ? ` (${option.code})` : ''}`
            }
            value={selectedSire || null}
            inputValue={value}
            onInputChange={(_, newInputValue) => {
              onChange(newInputValue);
            }}
            onChange={(_, newValue) => {
              if (newValue) {
                onChange(newValue.name, newValue.id);
              } else {
                onChange('');
              }
            }}
            filterOptions={(options, state) => {
              if (!state.inputValue) return options;
              const query = state.inputValue.toLowerCase();
              return options.filter(
                (option) =>
                  option.name.toLowerCase().includes(query) ||
                  (option.code && option.code.toLowerCase().includes(query)) ||
                  (option.earTag && option.earTag.toLowerCase().includes(query))
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
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ fontSize: '1.1rem', py: 1.5 }}>
                <Stack spacing={0.25}>
                  <Typography fontWeight={700}>{option.name}</Typography>
                  {option.code && (
                    <Typography variant="caption" color="text.secondary">
                      コード：{option.code}
                    </Typography>
                  )}
                  {option.earTag && (
                    <Typography variant="caption" color="text.secondary">
                      耳標番号：{option.earTag}
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
            noOptionsText={
              loading ? (
                <CircularProgress size={20} />
              ) : (
                '候補がありません'
              )
            }
          />
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
          sx={{
            mt: 0.5,
            whiteSpace: 'nowrap',
            fontSize: '1rem',
            py: 1.25,
          }}
        >
          新規登録
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {/* 選択後の詳細表示 */}
      {selectedSire && value && (
        <Box
          sx={{
            p: 1.5,
            bgcolor: '#f5f5f5',
            border: '2px solid #4caf50',
            borderRadius: 1,
            mt: 1,
          }}
        >
          <Typography
            fontWeight={800}
            sx={{
              fontSize: '1.2rem',
              color: '#1976d2',
              mb: 1,
            }}
          >
            ✓ {selectedSire.name}
          </Typography>
          <Stack spacing={0.75} sx={{ fontSize: '0.95rem' }}>
            {selectedSire.code && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ color: '#666', fontWeight: 600, minWidth: 70 }}>
                  略号：
                </Typography>
                <Typography sx={{ color: '#333', fontWeight: 600, fontSize: '1rem' }}>
                  {selectedSire.code}
                </Typography>
              </Box>
            )}
            {selectedSire.earTag && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography sx={{ color: '#666', fontWeight: 600, minWidth: 70 }}>
                  耳標番号：
                </Typography>
                <Typography sx={{ color: '#333', fontWeight: 600, fontSize: '1rem' }}>
                  {selectedSire.earTag}
                </Typography>
              </Box>
            )}
            {selectedSire.note && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Typography sx={{ color: '#666', fontWeight: 600, minWidth: 70 }}>
                  備考：
                </Typography>
                <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>
                  {selectedSire.note}
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {/* 新規登録ダイアログ */}
      <Dialog
        open={openDialog}
        onClose={() => {
          if (!creatingMaster) setOpenDialog(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontSize: '1.3rem', fontWeight: 800 }}>
          種雄牛を新規登録
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Alert severity="info" sx={{ fontSize: '1rem', py: 1.5 }}>
              新しい種雄牛を登録します。
              種付登録画面の内容は保持されます。
            </Alert>

            <TextField
              label="種雄牛名 *"
              value={newSireName}
              onChange={(e) => setNewSireName(e.target.value)}
              placeholder="例：福之姫、安福久"
              fullWidth
              size="small"
              autoFocus
              disabled={creatingMaster}
              sx={{ fontSize: '1.1rem' }}
            />

            <TextField
              label="コード（任意）"
              value={newSireCode}
              onChange={(e) => setNewSireCode(e.target.value)}
              placeholder="例：1234、ABC"
              fullWidth
              size="small"
              disabled={creatingMaster}
              sx={{ fontSize: '1.1rem' }}
            />

            <TextField
              label="耳標番号（任意）"
              value={newSireEarTag}
              onChange={(e) => setNewSireEarTag(e.target.value)}
              placeholder="例：001、JPN123"
              fullWidth
              size="small"
              disabled={creatingMaster}
              sx={{ fontSize: '1.1rem' }}
            />

            <TextField
              label="備考（任意）"
              value={newSireNote}
              onChange={(e) => setNewSireNote(e.target.value)}
              placeholder="例：父牛、母父牛など"
              fullWidth
              size="small"
              multiline
              minRows={2}
              disabled={creatingMaster}
              sx={{ fontSize: '1.1rem' }}
            />

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => {
              setOpenDialog(false);
              setNewSireName('');
              setNewSireCode('');
              setNewSireEarTag('');
              setNewSireNote('');
              setError('');
            }}
            disabled={creatingMaster}
            sx={{ fontSize: '1rem' }}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleCreateMaster}
            variant="contained"
            disabled={creatingMaster || !newSireName.trim()}
            sx={{ fontSize: '1rem' }}
          >
            {creatingMaster ? <CircularProgress size={20} /> : '登録'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
