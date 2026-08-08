import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import MicIcon from '@mui/icons-material/Mic';
import {
  Alert,
  Box,
  Button,
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
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type SearchItem = {
  id: string | number;
  kind: '繁殖牛' | '子牛';
  primaryNumber: string;
  identificationNumber?: string;
  name: string;
  sex?: string;
  path: string;
};

type SpeechRecognitionResultLike = {
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  results?: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function extractSpokenNumber(value: string) {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '');
}

export function GlobalAnimalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState('');

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
        kind: '繁殖牛',
        primaryNumber: row.earTag || '',
        identificationNumber: row.identificationNumber || '',
        name: row.name || '',
        path: `/cattle/${row.id}`,
      }));

      const calfItems: SearchItem[] = calves.map((row) => ({
        id: row.id,
        kind: '子牛',
        primaryNumber: formatTemporaryCalfNumber(row.calfNumber, row.birthday),
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
    setSpeechError('');
    navigate(path);
  };

  const handleVoiceSearch = () => {
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setSpeechError('この端末・ブラウザでは音声入力を利用できません。');
      return;
    }

    setSpeechError('');
    setListening(true);

    const recognition = new Recognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      const number = extractSpokenNumber(transcript);

      if (!number) {
        setSpeechError('個体番号を数字として認識できませんでした。もう一度お試しください。');
        return;
      }

      setQuery(number);
    };

    recognition.onerror = () => {
      setSpeechError('音声を認識できませんでした。もう一度お試しください。');
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
  };

  return (
    <>
      <Tooltip title="個体検索">
        <Button
          aria-label="個体検索"
          onClick={() => setOpen(true)}
          color="primary"
          variant="outlined"
          startIcon={<SearchIcon />}
          size="small"
          sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
        >
          個体検索
        </Button>
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
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="個体番号を音声入力">
                      <span>
                        <IconButton
                          aria-label="個体番号を音声入力"
                          onClick={handleVoiceSearch}
                          disabled={listening}
                          color={listening ? 'primary' : 'default'}
                        >
                          <MicIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />

            {listening && <Alert severity="info">個体番号を話してください。</Alert>}
            {speechError && <Alert severity="warning">{speechError}</Alert>}
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
                          {item.sex ? `${item.identificationNumber ? ' / ' : ''}性別 ${formatSex(item.sex)}` : ''}
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
