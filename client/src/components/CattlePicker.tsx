import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { Cattle } from '../types/cattle';
import { getCattleList } from '../services/api';

type Props = {
  label?: string;
  onSelect: (cattle: Cattle) => void;
};

export function CattlePicker({ label = '登録済み牛から選択', onSelect }: Props) {
  const [cattleList, setCattleList] = useState<Cattle[]>([]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    getCattleList().then(setCattleList).catch(() => setCattleList([]));
  }, []);

  const handleChange = (value: string) => {
    setSelectedId(value);
    const cattle = cattleList.find((item) => String(item.id) === value);
    if (cattle) onSelect(cattle);
  };

  return (
    <TextField
      label={label}
      select
      value={selectedId}
      onChange={(e) => handleChange(e.target.value)}
      fullWidth
      helperText="選択すると耳標番号と牛名が自動入力されます。手入力もできます。"
    >
      <MenuItem value="">選択しない</MenuItem>
      {cattleList.map((cattle) => (
        <MenuItem key={cattle.id} value={String(cattle.id)}>
          {cattle.name} / {cattle.earTag}
        </MenuItem>
      ))}
    </TextField>
  );
}
