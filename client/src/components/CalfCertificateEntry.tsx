import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import type { Calf } from '../types/calf';

function calfLabel(calf: Calf) {
  const tag = calf.calfNumber && !calf.calfNumber.startsWith('TEMP-') ? `耳標 ${calf.calfNumber}` : '耳標未装着';
  const name = calf.name && calf.name !== '耳標未装着' ? calf.name : '名号未登録';
  return [tag, name, calf.birthday ? `${calf.birthday}生` : '', calf.identificationNumber || ''].filter(Boolean).join(' ／ ');
}

export function CalfCertificateEntry({ calves }: { calves: Calf[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Calf | null>(null);
  return <>
    <Button variant="outlined" onClick={() => { setSelected(null); setOpen(true); }} sx={{ minHeight: 44 }}>登録証明書から入力</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm"
      PaperProps={{ sx: { m: 1, width: 'calc(100% - 16px)' } }} aria-labelledby="calf-certificate-entry-title">
      <DialogTitle id="calf-certificate-entry-title" fontWeight={800}>登録証明書から入力</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>登録済みの子牛を選ぶか、新しい子牛の登録へ進んでください。次の画面で写真・PDFを読み取ります。</Typography>
          <Autocomplete options={calves} value={selected} onChange={(_, value) => setSelected(value)}
            getOptionLabel={calfLabel} isOptionEqualToValue={(option, value) => option.id === value.id}
            noOptionsText="該当する子牛がありません" fullWidth
            renderOption={(props, calf) => <li {...props} key={calf.id} style={{ minHeight: 44, overflowWrap: 'anywhere' }}>{calfLabel(calf)}</li>}
            renderInput={(params) => <TextField {...params} label="登録済みの子牛" placeholder="耳標番号・名号で検索" />} />
          <Button component={RouterLink} to={selected ? `/calves/${selected.id}/edit?source=calf-certificate` : '#'}
            disabled={!selected} onClick={() => setOpen(false)} variant="contained" sx={{ minHeight: 44 }}>この子牛の証明書を読み取る</Button>
          <Button component={RouterLink} to="/calves/new?source=calf-certificate" onClick={() => setOpen(false)}
            variant="outlined" sx={{ minHeight: 44 }}>新しい子牛を登録する</Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpen(false)} sx={{ minHeight: 44 }}>閉じる</Button></DialogActions>
    </Dialog>
  </>;
}
