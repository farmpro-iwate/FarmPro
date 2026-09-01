import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettingsForPageOpen, updateFarmSettings } from '../services/settingsApi';
import { getStoredAuthUser, type AuthUser } from '../services/authClient';
import { AccountSecurityCard } from '../components/AccountSecurityCard';

const emptySettings: FarmSettings = {
  farmName: '', ownerName: '', staffName: '', phone: '', address: '', estrousCycleDays: 21,
  bullMasters: [], supplierMasters: [], memo: ''
};

function display(value: string) { return value || '-'; }
function planLabel(plan?: string) {
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}
function normalizeList(value?: string[]) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function SettingsPage() {
  const [form, setForm] = useState<FarmSettings>(emptySettings);
  const [accountUser, setAccountUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getFarmSettingsForPageOpen().then((data) => setForm({
      ...emptySettings,
      ...data,
      bullMasters: normalizeList(data.bullMasters),
      supplierMasters: normalizeList(data.supplierMasters)
    })).finally(() => setLoading(false));
  }, []);

  const setValue = (key: keyof FarmSettings, value: string | number | string[]) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const savedSettings = await updateFarmSettings(form);
    setForm({
      ...emptySettings,
      ...savedSettings,
      bullMasters: normalizeList(savedSettings.bullMasters),
      supplierMasters: normalizeList(savedSettings.supplierMasters)
    });
    setAccountUser(getStoredAuthUser());
    setSaved(true);
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800} className="no-print">農場設定</Typography>

      {accountUser && (
        <Card className="no-print" variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6" fontWeight={800}>アカウント情報</Typography>
              <Typography color="text.secondary">
                登録時のログイン情報と現在の利用プランを確認できます。
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell sx={{ fontWeight: 700, width: { sm: 180 } }}>メールアドレス</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{accountUser.email}</TableCell></TableRow>
                  <TableRow><TableCell sx={{ fontWeight: 700 }}>現在のプラン</TableCell><TableCell>{planLabel(accountUser.plan)}</TableCell></TableRow>
                  <TableRow><TableCell sx={{ fontWeight: 700 }}>農場名</TableCell><TableCell>{accountUser.farmName || '-'}</TableCell></TableRow>
                  <TableRow><TableCell sx={{ fontWeight: 700 }}>代表者名</TableCell><TableCell>{accountUser.name || '-'}</TableCell></TableRow>
                </TableBody>
              </Table>
              <Alert severity="info">
                農場名・代表者名は下の「農場情報」で変更できます。メールアドレスとパスワードは下の「ログイン情報の変更」から変更できます。
              </Alert>
            </Stack>
          </CardContent>
        </Card>
      )}

      {accountUser && <AccountSecurityCard onUserChange={setAccountUser} />}

      {saved && <Alert severity="success">農場設定を保存しました。</Alert>}

      <Card className="no-print">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>農場情報</Typography>
            <TextField label="農場名" value={form.farmName} onChange={(e) => setValue('farmName', e.target.value)} fullWidth />
            <TextField label="代表者名" value={form.ownerName} onChange={(e) => setValue('ownerName', e.target.value)} fullWidth />
            <TextField label="担当者名" value={form.staffName} onChange={(e) => setValue('staffName', e.target.value)} fullWidth />
            <TextField label="電話番号" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} fullWidth />
            <TextField label="住所" value={form.address} onChange={(e) => setValue('address', e.target.value)} fullWidth />
            <TextField label="発情周期（日）" type="number" value={form.estrousCycleDays} onChange={(e) => setValue('estrousCycleDays', Number(e.target.value))} fullWidth />
            <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} multiline minRows={3} fullWidth />
            <Button variant="contained" size="large" onClick={handleSave}>設定を保存</Button>
          </Stack>
        </CardContent>
      </Card>

      <Card className="print-card"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>現在の農場情報</Typography>
        <Typography color="text.secondary">印刷時にも確認できる設定内容です。</Typography>
        <Divider />
        <Table
          size="small"
          sx={{
            '& .MuiTableRow-root': {
              display: { xs: 'block', sm: 'table-row' },
              borderBottom: { xs: 1, sm: 0 },
              borderColor: { xs: 'divider', sm: 'transparent' },
              py: { xs: 1, sm: 0 }
            },
            '& .MuiTableCell-root': {
              display: { xs: 'block', sm: 'table-cell' },
              borderBottom: { xs: 0, sm: 1 },
              px: { xs: 0, sm: 2 },
              overflowWrap: 'anywhere'
            },
            '& .MuiTableCell-root:first-of-type': {
              fontWeight: 700,
              color: 'text.secondary',
              pb: { xs: 0.25, sm: 1 }
            },
            '& .MuiTableCell-root:last-of-type': {
              pt: { xs: 0, sm: 1 }
            }
          }}
        >
          <TableBody>
          <TableRow><TableCell>農場名</TableCell><TableCell>{display(form.farmName)}</TableCell></TableRow>
          <TableRow><TableCell>代表者名</TableCell><TableCell>{display(form.ownerName)}</TableCell></TableRow>
          <TableRow><TableCell>担当者名</TableCell><TableCell>{display(form.staffName)}</TableCell></TableRow>
          <TableRow><TableCell>電話番号</TableCell><TableCell>{display(form.phone)}</TableCell></TableRow>
          <TableRow><TableCell>住所</TableCell><TableCell>{display(form.address)}</TableCell></TableRow>
          <TableRow><TableCell>発情周期</TableCell><TableCell>{form.estrousCycleDays}日</TableCell></TableRow>
          <TableRow><TableCell>旧種雄牛候補（互換）</TableCell><TableCell>{form.bullMasters.join('、') || '-'}</TableCell></TableRow>
          <TableRow><TableCell>旧購入先候補（互換）</TableCell><TableCell>{form.supplierMasters.join('、') || '-'}</TableCell></TableRow>
          <TableRow><TableCell>メモ</TableCell><TableCell>{display(form.memo)}</TableCell></TableRow>
        </TableBody></Table>
      </Stack></CardContent></Card>
    </Stack>
  );
}