import { useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { FARM_PRO_PLANS } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getDeviceSyncPreview, pullCloudToLocal, pushLocalToCloud, type DeviceSyncPreview } from '../services/deviceSync';

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('ja-JP') : '-';
}

function directionLabel(direction: DeviceSyncPreview['direction']) {
  switch (direction) {
    case 'cloud-newer': return 'クラウド側のデータが新しいです。';
    case 'local-newer': return 'この端末のデータが新しいです。';
    case 'same': return '端末とクラウドは同じ状態です。';
    case 'cloud-empty': return 'クラウドにはまだデータがありません。';
    case 'conflict': return 'この端末とクラウドの両方に変更があります。';
  }
}

export function DeviceSyncPage() {
  const plan = FARM_PRO_PLANS[getCurrentFarmProPlanId()];
  const authUser = getStoredAuthUser();
  const loggedIn = Boolean(authUser && hasAuthToken());
  const [preview, setPreview] = useState<DeviceSyncPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handlePreview = async () => {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      setPreview(await getDeviceSyncPreview());
    } catch (err) {
      setError(err instanceof Error ? err.message : '同期状態を確認できませんでした。');
    } finally {
      setRunning(false);
    }
  };

  const handlePush = async () => {
    if (preview?.direction === 'conflict') return;
    const confirmed = window.confirm('この端末の現在のデータをクラウドへ反映します。実行しますか？');
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pushLocalToCloud();
      setMessage('この端末のデータをクラウドへ反映しました。');
      setPreview(await getDeviceSyncPreview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'クラウドへの反映に失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  const handlePull = async () => {
    if (!preview?.cloudBackup || preview.direction === 'conflict') return;
    const confirmed = window.confirm(
      'クラウドのデータで、この端末のFarmProデータを置き換えます。\n\n現在の端末内データは上書きされます。実行しますか？'
    );
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pullCloudToLocal(preview.cloudBackup);
      setMessage('クラウドのデータをこの端末へ反映しました。画面を再読み込みします。');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'クラウドからの反映に失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>複数端末同期</Typography>
      <Typography color="text.secondary">
        端末とクラウドの更新状況を比較してから、どちらを反映するか選びます。自動で端末データを書き換えることはありません。
      </Typography>

      {!plan.multiDeviceSync && <Alert severity="info">複数端末同期はStandard / Proプランで利用できます。</Alert>}
      {plan.multiDeviceSync && !loggedIn && <Alert severity="warning">複数端末同期を利用するにはログインが必要です。</Alert>}

      {plan.multiDeviceSync && loggedIn && authUser && (
        <Card><CardContent><Stack spacing={2}>
          <Table size="small"><TableBody>
            <TableRow><TableCell>農場</TableCell><TableCell>{authUser.farmName}</TableCell></TableRow>
            <TableRow><TableCell>利用者</TableCell><TableCell>{authUser.name}</TableCell></TableRow>
          </TableBody></Table>

          <Button variant="contained" size="large" onClick={handlePreview} disabled={running} fullWidth>
            {running ? '確認中…' : '同期状態を確認'}
          </Button>

          {preview && (
            <Card variant="outlined"><CardContent><Stack spacing={1.5}>
              <Alert severity={preview.direction === 'same' ? 'success' : preview.direction === 'cloud-empty' ? 'info' : 'warning'}>
                {directionLabel(preview.direction)}
              </Alert>
              {preview.direction === 'conflict' && (
                <Alert severity="error">
                  両方に変更があるため自動判定できません。データ消失を防ぐため、この画面からの上書き操作を停止しています。
                </Alert>
              )}
              <Table size="small"><TableBody>
                <TableRow><TableCell>この端末の最終更新</TableCell><TableCell>{formatDate(preview.localUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>クラウドの最終更新</TableCell><TableCell>{formatDate(preview.cloudUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>この端末の件数</TableCell><TableCell>{preview.localRecordCount}件</TableCell></TableRow>
                <TableRow><TableCell>クラウドの件数</TableCell><TableCell>{preview.cloudRecordCount}件</TableCell></TableRow>
              </TableBody></Table>

              <Button variant="contained" onClick={handlePush} disabled={running || preview.direction === 'conflict'} fullWidth>
                この端末 → クラウドへ反映
              </Button>
              <Button color="warning" variant="contained" onClick={handlePull} disabled={running || !preview.cloudBackup || preview.direction === 'conflict'} fullWidth>
                クラウド → この端末へ反映
              </Button>
            </Stack></CardContent></Card>
          )}
        </Stack></CardContent></Card>
      )}

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
