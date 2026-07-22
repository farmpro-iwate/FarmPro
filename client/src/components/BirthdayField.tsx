import { useEffect, useState } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { formatJapaneseEra, parseJapaneseEra } from '../utils/japaneseEra';

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

export function BirthdayField({ value, onChange, required = false }: Props) {
  const [japaneseInput, setJapaneseInput] = useState(() => formatJapaneseEra(value));
  const [error, setError] = useState('');

  useEffect(() => {
    setJapaneseInput(formatJapaneseEra(value));
    setError('');
  }, [value]);

  const handleJapaneseChange = (nextValue: string) => {
    setJapaneseInput(nextValue);
    setError('');

    if (!nextValue.trim()) {
      onChange('');
      return;
    }

    const converted = parseJapaneseEra(nextValue);
    if (converted) onChange(converted);
  };

  const handleJapaneseBlur = () => {
    if (!japaneseInput.trim()) {
      setError('');
      return;
    }

    const converted = parseJapaneseEra(japaneseInput);
    if (!converted) {
      setError('和暦は「令和3年4月15日」の形式で入力してください');
      return;
    }

    onChange(converted);
    setJapaneseInput(formatJapaneseEra(converted));
    setError('');
  };

  return (
    <Stack spacing={1}>
      <TextField
        label="生年月日（西暦）"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        InputLabelProps={{ shrink: true }}
        required={required}
        fullWidth
      />
      <TextField
        label="生年月日（和暦）"
        value={japaneseInput}
        onChange={(event) => handleJapaneseChange(event.target.value)}
        onBlur={handleJapaneseBlur}
        placeholder="例：令和3年4月15日"
        error={Boolean(error)}
        helperText={error || '西暦または和暦のどちらか一方を入力すると、もう一方へ自動変換します'}
        fullWidth
      />
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
