import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Stack, Typography,
} from '@mui/material';
import {
  DEFAULT_FARM_STORY_CATEGORIES, FARM_STORY_CATEGORIES, type FarmStoryCategoryId,
} from '../services/farmStoryDisplaySettings';

export type FarmStoryDisplaySettingsProps = {
  open: boolean;
  selected: readonly FarmStoryCategoryId[];
  onClose: () => void;
  onSave: (categories: FarmStoryCategoryId[]) => void | Promise<void>;
};

const groups = [...new Set(FARM_STORY_CATEGORIES.map(category => category.group))];
function normalizeSelection(selected: readonly FarmStoryCategoryId[]): FarmStoryCategoryId[] {
  return FARM_STORY_CATEGORIES.filter(category => selected.includes(category.id)).map(category => category.id);
}

export function FarmStoryDisplaySettings({ open, selected, onClose, onSave }: FarmStoryDisplaySettingsProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [draft, setDraft] = useState<FarmStoryCategoryId[]>(() => normalizeSelection(selected));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const selectedRef = useRef(selected);
  const openRef = useRef(open);
  const generation = useRef(0);
  const mounted = useRef(false);
  selectedRef.current = selected;
  openRef.current = open;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => {
    generation.current += 1;
    savingRef.current = false;
    setSaving(false);
    setError('');
    if (open) setDraft(normalizeSelection(selectedRef.current));
  }, [open]);

  const close = () => { if (!savingRef.current) onClose(); };
  const replaceDraft = (categories: readonly FarmStoryCategoryId[]) => {
    if (!savingRef.current) setDraft(normalizeSelection(categories));
  };
  const toggle = (id: FarmStoryCategoryId) => {
    if (savingRef.current) return;
    setDraft(current => current.includes(id) ? current.filter(category => category !== id) : normalizeSelection([...current, id]));
  };
  const save = async () => {
    if (!openRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    const attempt = generation.current;
    const current = () => mounted.current && openRef.current && generation.current === attempt;
    try {
      await onSave(normalizeSelection(draft));
      if (current()) onClose();
    } catch (cause) {
      if (current()) setError(cause instanceof Error && cause.message
        ? cause.message : '表示設定を保存できませんでした。もう一度お試しください。');
    } finally {
      if (mounted.current && generation.current === attempt) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  return <Dialog open={open} onClose={close} disableEscapeKeyDown={saving} fullWidth maxWidth="sm"
    aria-labelledby={titleId} aria-describedby={descriptionId}>
    <DialogTitle id={titleId} sx={{ fontWeight: 800 }}>農場ストーリーの表示設定</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography id={descriptionId} variant="body2" color="text.secondary">
          表示する項目を選びます。設定はこの端末の利用者・農場ごとに保存されます。
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" disabled={saving} onClick={() => replaceDraft(FARM_STORY_CATEGORIES.map(category => category.id))} sx={{ minHeight: 44 }}>全選択</Button>
          <Button variant="outlined" disabled={saving} onClick={() => replaceDraft([])} sx={{ minHeight: 44 }}>全解除</Button>
          <Button variant="outlined" disabled={saving} onClick={() => replaceDraft(DEFAULT_FARM_STORY_CATEGORIES)} sx={{ minHeight: 44 }}>初期設定</Button>
        </Box>
        {groups.map(group => <Box component="fieldset" key={group} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Typography component="legend" variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>{group}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.5 }}>
            {FARM_STORY_CATEGORIES.filter(category => category.group === group).map(category => <FormControlLabel
              key={category.id}
              control={<Checkbox checked={draft.includes(category.id)} onChange={() => toggle(category.id)} disabled={saving} />}
              label={category.label}
              sx={{ m: 0, minHeight: 48, px: 0.5, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' },
                '& .MuiFormControlLabel-label': { lineHeight: 1.5 } }}
            />)}
          </Box>
        </Box>)}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2, '& .MuiButton-root': { minHeight: 44 } }}>
      <Button variant="outlined" disabled={saving} onClick={close}>キャンセル</Button>
      <Button variant="contained" disabled={saving} onClick={() => { void save(); }}>{saving ? '保存中…' : '保存'}</Button>
    </DialogActions>
  </Dialog>;
}
