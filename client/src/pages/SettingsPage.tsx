import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettings, updateFarmSettings } from '../services/settingsApi';

const emptySettings: FarmSettings = {
  farmName: '',
  ownerName: '',
  staffName: '',
  phone: '',
  address: '',
  estrousCycleDays: 21,
  memo: ''
};

function display(value: string) {
  return value || '-';
}

export function SettingsPage() {
  const [form, setForm] = useState<FarmSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFarmSettings().then(setForm).finally(() => setLoading(false));
  }, []);

  const setValue = (key: keyof FarmSettings, value: string | number) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const savedSettings = await updateFarmSettings(form);
    setForm(savedSettings);
    setSaved(true);
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800}>農場設定</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      {saved && <Alert severity="success">農場設定を保存しました。</Alert>}

      <Card className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>設定を編集</Typography>
            <TextField label="農場名" value={form.farmName} onChange={(e) => setValue('farmName', e.target.value)} fullWidth />
            <TextField label="代表者名" value={form.ownerName} onChange={(e) => setValue('ownerName', e.target.value)} fullWidth />
            <TextField label="担当者名" value={form.staffName} onChange={(e) => setValue('staffName', e.target.value)} fullWidth />
            <TextField label="電話番号" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} fullWidth />
            <TextField label="住所" value={form.address} onChange={(e) => setValue('address', e.target.value)} fullWidth />
            <TextField label="発情周期（日）" type="number" value={form.estrousCycleDays} onChange={(e) => setValue('estrousCycleDays', Number(e.target.value))} fullWidth />
            <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} multiline minRows={3} fullWidth />
            <Button variant="contained" size="large" onClick={handleSave}>保存</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>現在の農場情報</Typography>
            <Typography color="text.secondary">印刷時にも確認できる設定内容です。</Typography>
            <Divider />
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>農場名</TableCell><TableCell>{display(form.farmName)}</TableCell></TableRow>
                <TableRow><TableCell>代表者名</TableCell><TableCell>{display(form.ownerName)}</TableCell></TableRow>
                <TableRow><TableCell>担当者名</TableCell><TableCell>{display(form.staffName)}</TableCell></TableRow>
                <TableRow><TableCell>電話番号</TableCell><TableCell>{display(form.phone)}</TableCell></TableRow>
                <TableRow><TableCell>住所</TableCell><TableCell>{display(form.address)}</TableCell></TableRow>
                <TableRow><TableCell>発情周期</TableCell><TableCell>{form.estrousCycleDays}日</TableCell></TableRow>
                <TableRow><TableCell>メモ</TableCell><TableCell>{display(form.memo)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
