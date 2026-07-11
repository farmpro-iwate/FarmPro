import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { getCattleList } from '../services/api';
import { getCalfList } from '../services/calfApi';

type SearchItem = {
  id: string | number;
  kind: '成牛' | '子牛';
  primaryNumber: string;
  identificationNumber?: string;
  name: string;
  sex?: string;
  path: string;
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function GlobalAnimalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setError('');

    Promise.all([
      getCattleList().catch(() => []),
      getCalfList().catch(() => []),
    ]).then(([cattle, calves]) => {
      if (!active) return;

      const cattleItems: SearchItem[] = cattle.map((row) => ({
        id: row.id,
        kind: '成牛',
        primaryNumber: row.earTag || '',
        identificationNumber: row.identificationNumber || '',
        name: row.name || '',
        path: `/cattle/${row.id}`,
      }));

      const calfItems: SearchItem[] = calves.map((row) => ({
        id: row.id,
        kind: '子牛',
        primaryNumber: row.calfNumber || '',
        name: row.name || '',
        sex: row.sex || '',
        path: `/calves/${row.id}`,
      }));

      setItems([...cattleItems, ...calfItems]);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('個体情報を読み込めませんでした。');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open]);

  const results = useMemo(() => {
    const keyword = normalize(query);
    if (!keyword) return [];

    return items.filter((item) => [
      item.primaryNumber,
      item.identificationNumber,
      item.name,
      item.sex,
    ].some((value) => normalize(value).includes(keyword))).slice(0, 30);
  }, [items, query]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <>
      <Tooltip title="個体を検索">
        <IconButton
          aria-label="個体を検索"
          onClick={() => setOpen(true)}
          color="primary"
          sx={{
            border: 1,
            borderColor: 'primary.main',
            borderRadius: 1,
            width: 38,
            height: 34,
          }}
        >
          <SearchIcon />
        </IconButton>
      </Tooltip>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={900}>個体検索</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label="耳標番号・個体識別番号・名号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon /></InputAdornment>
                ),
              }}
            />

            {loading && <Typography color="text.secondary">個体情報を読み込み中...</Typography>}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && !error && query && results.length === 0 && (
              <Alert severity="info">該当する個体が見つかりません。</Alert>
            )}

            {results.length > 0 && (
              <List disablePadding>
                {results.map((item) => (
                  <ListItemButton
                    key={`${item.kind}-${item.id}`}
                    onClick={() => handleSelect(item.path)}
                    divider
                    sx={{ px: 1, py: 1.25 }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip size="small" label={item.kind} />
                          <Typography fontWeight={900}>{item.primaryNumber || '番号未登録'}</Typography>
                          <Typography fontWeight={700}>{item.name || '名号未登録'}</Typography>
                        </Stack>
                      }
                      secondary={
                        <Box component="span">
                          {item.identificationNumber ? `個体識別番号 ${item.identificationNumber}` : ''}
                          {item.sex ? `${item.identificationNumber ? ' / ' : ''}性別 ${item.sex}` : ''}
                        </Box>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
