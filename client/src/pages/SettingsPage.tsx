import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettingsForPageOpen, updateFarmSettings } from '../services/settingsApi';
import { getStoredAuthUser, type AuthUser } from '../services/authClient';
import { AccountSecurityCard } from '../components/AccountSecurityCard';
import { defaultAlertSettings, getAlertSettings, saveAlertSettings, type AlertSettings } from '../services/alertSettings';

const emptySettings: FarmSettings = {
  farmName: '', ownerName: '', staffName: '', phone: '', address: '', estrousCycleDays: 21,
  bullMasters: [], supplierMasters: [], memo: ''
};

function planLabel(plan?: string) {
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}
function normalizeList(value?: string[]) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export function SettingsPage() {
  const [form, setForm] = useState<FarmSettings>(emptySettings);
  const [alertSettings, setAlertSettings] = useState<AlertSettings>(defaultAlertSettings);
  const [accountUser, setAccountUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      getFarmSettingsForPageOpen(),
      getAlertSettings(),
    ]).then(([data, alertData]) => {
      setForm({
        ...emptySettings,
        ...data,
        bullMasters: normalizeList(data.bullMasters),
        supplierMasters: normalizeList(data.supplierMasters)
      });
      setAlertSettings(alertData);
    }).finally(() => setLoading(false));
  }, []);

  const setValue = (key: keyof FarmSettings, value: string | number | string[]) => {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setAlertValue = (key: keyof AlertSettings, value: number) => {
    setAlertSaved(false);
    setAlertSettings((prev) => ({ ...prev, [key]: value }));
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

  const handleAlertSave = async () => {
    const savedSettings = await saveAlertSettings(alertSettings);
    setAlertSettings(savedSettings);
    setAlertSaved(true);
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  const alertFields: Array<{ key: keyof AlertSettings; label: string }> = [
    { key: 'scheduleDays', label: '未完了予定' },
    { key: 'pregnancyCheckDays', label: '妊娠鑑定' },
    { key: 'nextHeatDays', label: '次回発情確認' },
    { key: 'recheckDays', label: '再鑑定' },
    { key: 'calvingDays', label: '分娩予定' },
    { key: 'vaccineDays', label: 'ワクチン' },
  ];

  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 1400, mx: 'auto', overflowX: 'hidden' }}>
      <Typography variant="h5" fontWeight={800} className="no-print">農場設定</Typography>

      {saved && <Alert severity="success">農場設定を保存しました。</Alert>}
      {alertSaved && <Alert severity="success">アラート通知日数を保存しました。</Alert>}

      <Grid container spacing={2} alignItems="flex-start" className="no-print" sx={{ width: '100%', m: 0 }}>
        <Grid item xs={12} lg={5}>
          <Stack spacing={2}>
            <Card>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack spacing={1.5}>
                  <Typography variant="h6" fontWeight={800}>農場情報</Typography>
                  <Grid container spacing={1.25}>
                    <Grid item xs={12} md={6}>
                      <TextField label="農場名" value={form.farmName} onChange={(e) => setValue('farmName', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField label="代表者名" value={form.ownerName} onChange={(e) => setValue('ownerName', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField label="担当者名" value={form.staffName} onChange={(e) => setValue('staffName', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField label="電話番号" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={8}>
                      <TextField label="住所" value={form.address} onChange={(e) => setValue('address', e.target.value)} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField label="発情周期（日）" type="number" value={form.estrousCycleDays} onChange={(e) => setValue('estrousCycleDays', Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={12}>
                      <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} size="small" multiline minRows={2} fullWidth />
                    </Grid>
                  </Grid>
                  <Button variant="contained" onClick={handleSave}>設定を保存</Button>
                </Stack>
              </CardContent>
            </Card>

            {accountUser && (
              <Card variant="outlined">
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Stack spacing={1.25}>
                    <Typography variant="h6" fontWeight={800}>アカウント情報</Typography>
                    <Table size="small">
                      <TableBody>
                        <TableRow><TableCell sx={{ fontWeight: 700, width: { sm: 150 } }}>メールアドレス</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{accountUser.email}</TableCell></TableRow>
                        <TableRow><TableCell sx={{ fontWeight: 700 }}>現在のプラン</TableCell><TableCell>{planLabel(accountUser.plan)}</TableCell></TableRow>
                        <TableRow><TableCell sx={{ fontWeight: 700 }}>農場名</TableCell><TableCell>{accountUser.farmName || '-'}</TableCell></TableRow>
                        <TableRow><TableCell sx={{ fontWeight: 700 }}>代表者名</TableCell><TableCell>{accountUser.name || '-'}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </Stack>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack spacing={1.5}>
                  <Stack spacing={0.25}>
                    <Typography variant="h6" fontWeight={800}>アラート通知設定</Typography>
                    <Typography variant="body2" color="text.secondary">各予定を何日前からアラートに表示するか設定できます。</Typography>
                  </Stack>
                  <Grid container spacing={1.25}>
                    {alertFields.map((field) => (
                      <Grid item xs={12} sm={6} key={field.key}>
                        <TextField
                          label={`${field.label}（日前）`}
                          type="number"
                          value={alertSettings[field.key]}
                          onChange={(e) => setAlertValue(field.key, Number(e.target.value))}
                          inputProps={{ min: 0, max: 365 }}
                          size="small"
                          fullWidth
                        />
                      </Grid>
                    ))}
                  </Grid>
                  <Button variant="contained" onClick={handleAlertSave}>アラート設定を保存</Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={7}>
          {accountUser && <AccountSecurityCard onUserChange={setAccountUser} />}
        </Grid>
      </Grid>
    </Stack>
  );
}
