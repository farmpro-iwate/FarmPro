import { useEffect, useMemo, useState } from 'react';
import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Cattle } from '../types/cattle';
import { getCattleList } from '../services/api';

type Props = {
  selectedIds: string[];
  onChange: (cattle: Cattle[]) => void;
};

export function CattleMultiPicker({ selectedIds, onChange }: Props) {
  const [cattleList, setCattleList] = useState<Cattle[]>([]);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    getCattleList().then(setCattleList).catch(() => setCattleList([]));
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return cattleList;
    return cattleList.filter((cattle) =>
      `${cattle.name} ${cattle.earTag}`.toLowerCase().includes(q),
    );
  }, [cattleList, keyword]);

  const toggle = (cattle: Cattle, checked: boolean) => {
    const current = new Set(selectedIds);
    if (checked) current.add(String(cattle.id));
    else current.delete(String(cattle.id));
    onChange(cattleList.filter((item) => current.has(String(item.id))));
  };

  return (
    <Stack spacing={1}>
      <TextField
        label="牛を検索"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="牛名・耳標番号"
        size="small"
        fullWidth
      />
      <Typography color="text.secondary">選択：{selectedIds.length}頭</Typography>
      <FormGroup sx={{ maxHeight: 280, overflowY: 'auto', pr: 1 }}>
        {filtered.map((cattle) => (
          <FormControlLabel
            key={cattle.id}
            control={
              <Checkbox
                checked={selectedIds.includes(String(cattle.id))}
                onChange={(event) => toggle(cattle, event.target.checked)}
              />
            }
            label={`${cattle.name} / ${cattle.earTag}`}
          />
        ))}
      </FormGroup>
    </Stack>
  );
}
