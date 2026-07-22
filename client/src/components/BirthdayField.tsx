import { useEffect, useState } from 'react';
import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatJapaneseEra, parseJapaneseEra } from '../utils/japaneseEra';

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

type EraName = '令和' | '平成' | '昭和' | '大正' | '明治';

type EraParts = {
  era: EraName;
  year: string;
  month: string;
  day: string;
};

const initialEraParts: EraParts = {
  era: '令和',
  year: '',
  month: '',
  day: '',
};

function partsFromIsoDate(isoDate: string): EraParts {
  const formatted = formatJapaneseEra(isoDate);
  const match = /^(令和|平成|昭和|大正|明治)(元|\d+)年(\d+)月(\d+)日$/.exec(formatted);
  if (!match) return initialEraParts;

  return {
    era: match[1] as EraName,
    year: match[2] === '元' ? '1' : match[2],
    month: match[3],
    day: match[4],
  };
}

export function BirthdayField({ value, onChange, required = false }: Props) {
  const [eraParts, setEraParts] = useState<EraParts>(() => partsFromIsoDate(value));
  const [error, setError] = useState('');

  useEffect(() => {
    setEraParts(partsFromIsoDate(value));
    setError('');
  }, [value]);

  const updateEraPart = (key: keyof EraParts, nextValue: string) => {
    const next = { ...eraParts, [key]: nextValue };
    setEraParts(next);
    setError('');

    if (!next.year || !next.month || !next.day) return;

    const converted = parseJapaneseEra(`${next.era}${next.year}年${next.month}月${next.day}日`);
    if (!converted) {
      setError('入力した和暦の日付を確認してください');
      return;
    }

    onChange(converted);
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        label="生年月日（西暦）"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        InputLabelProps={{ shrink: true }}
        required={required}
        fullWidth
      />

      <Typography variant="subtitle2" fontWeight={700}>
        和暦で入力する場合
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField
          label="元号"
          select
          value={eraParts.era}
          onChange={(event) => updateEraPart('era', event.target.value)}
          sx={{ minWidth: { sm: 120 } }}
          fullWidth
        >
          <MenuItem value="令和">令和</MenuItem>
          <MenuItem value="平成">平成</MenuItem>
          <MenuItem value="昭和">昭和</MenuItem>
          <MenuItem value="大正">大正</MenuItem>
          <MenuItem value="明治">明治</MenuItem>
        </TextField>
        <TextField
          label="年"
          type="number"
          value={eraParts.year}
          onChange={(event) => updateEraPart('year', event.target.value)}
          inputProps={{ min: 1, inputMode: 'numeric' }}
          helperText="元年は1"
          fullWidth
        />
        <TextField
          label="月"
          type="number"
          value={eraParts.month}
          onChange={(event) => updateEraPart('month', event.target.value)}
          inputProps={{ min: 1, max: 12, inputMode: 'numeric' }}
          fullWidth
        />
        <TextField
          label="日"
          type="number"
          value={eraParts.day}
          onChange={(event) => updateEraPart('day', event.target.value)}
          inputProps={{ min: 1, max: 31, inputMode: 'numeric' }}
          error={Boolean(error)}
          fullWidth
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {value && !error && (
        <Alert severity="info" icon={false}>
          <Typography variant="body2">
            西暦：{value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')} ／ 和暦：{formatJapaneseEra(value)}
          </Typography>
        </Alert>
      )}
    </Stack>
  );
}
