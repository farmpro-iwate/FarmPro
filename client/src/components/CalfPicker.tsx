import { useEffect, useState } from 'react';
import { MenuItem, TextField } from '@mui/material';
import { Calf } from '../types/calf';
import { getCalfList } from '../services/calfApi';

type Props = {
  label?: string;
  onSelect: (calf: Calf) => void;
};

export function CalfPicker({ label = '登録済み子牛から選択', onSelect }: Props) {
  const [calfList, setCalfList] = useState<Calf[]>([]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    getCalfList().then(setCalfList).catch(() => setCalfList([]));
  }, []);

  const handleChange = (value: string) => {
    setSelectedId(value);
    const calf = calfList.find((item) => String(item.id) === value);
    if (calf) onSelect(calf);
  };

  return (
    <TextField
      label={label}
      select
      value={selectedId}
      onChange={(e) => handleChange(e.target.value)}
      fullWidth
      helperText="選択すると子牛番号と子牛名が自動入力されます。手入力もできます。"
    >
      <MenuItem value="">選択しない</MenuItem>
      {calfList.map((calf) => (
        <MenuItem key={calf.id} value={String(calf.id)}>
          {calf.name} / {calf.calfNumber}
        </MenuItem>
      ))}
    </TextField>
  );
}
