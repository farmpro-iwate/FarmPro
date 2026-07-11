import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { createMaster, getMasters } from '../services/masterApi';
import { MasterCategory, MasterItem } from '../types/master';

type Props = {
  category: MasterCategory;
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
};

export function MasterSelectWithQuickAdd({ category, label, value, onChange, helperText }: Props) {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await getMasters(category);
    setItems(data.filter((item) => item.active));
  };

  useEffect(() => {
    load().catch(() => setError('マスター一覧を読み込めませんでした'));
  }, [category]);

  const selected = useMemo(() => items.find((item) => item.name === value) || null, [items, value]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setError('名称を入力してください');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createMaster({ category, name, code: '', detail: '', note: '', active: true });
      setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      onChange(created.name);
      setNewName('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
        <Autocomplete
          fullWidth
          options={items}
          value={selected}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, current) => option.id === current.id}
          onChange={(_, item) => onChange(item?.name || '')}
          renderInput={(params) => <TextField {...params} label={label} helperText={helperText || '登録済みマスターから選択'} />}
        />
        <Button variant="outlined" onClick={() => { setNewName(value); setError(''); setOpen(true); }} sx={{ minWidth: 130, height: 56 }}>
          ＋ 新規登録
        </Button>
      </Stack>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{label}を新規登録</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">登録後、この項目を自動選択して元の入力を続けられます。</Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="名称" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>キャンセル</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>{saving ? '登録中...' : '登録して選択'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
