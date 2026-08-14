import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { FARM_PRO_PLANS } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import {
  getDeviceSyncPreview,
  isDeviceSyncInitialized,
  pullCloudToLocal,
  pushLocalToCloud,
  type DeviceSyncPreview,
  type SyncStoreDiff,
} from '../services/deviceSync';

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('ja-JP') : '-';
}

function formatIds(ids: string[], total: number) {
  if (ids.length === 0) return '-';
  const suffix = total > ids.length ? ` ほか${total - ids.length}件` : '';
  return `${ids.join('、')}${suffix}`;
}

const STORE_LABELS: Record<SyncStoreDiff['storeName'], string> = {
  settings: '設定',
  masters: 'マスター',
  cattle: '繁殖牛',
  calves: '子牛',
  breedings: '繁殖記録',
  calvings: '分娩',
  treatments: '治療',
  vaccines: 'ワクチン',
  blvTests: 'BLV検査',
  schedules: '予定',
  feedings: '飼料給与',
  feedingGuide: '給与ガイド',
  feedingAlertActions: '給与アラート対応',
  feedInventory: '飼料在庫',
  fatteningTransitions: '肥育移行',
  sales: '販売',
  expenses: '経費',
  photos: '写真',
  metadata: '内部情報',
};

export function DeviceSyncPage() {
  const plan = FARM_PRO_PLANS[getCurrentFarmProPlanId()];
  const authUser = getStoredAuthUser();
  const loggedIn = Boolean(authUser && hasAuthToken());
  const [preview, setPreview] = useState<DeviceSyncPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [needsInitialChoice, setNeedsInitialChoice] = useState(false);

  const refreshPreview = async () => {
    const next = await getDeviceSyncPreview();
    setPreview(next);
    return next;
  };

  const runAutomaticSync = async () => {
    if (!plan.multiDeviceSync || !loggedIn || running) return;

    setRunning(true);
    setMessage('');
    setError('');
    setNeedsInitialChoice(false);

    try {
      const initializedBeforeCheck = isDeviceSyncInitialized();
      const next = await refreshPreview();

      if (next.direction === 'same') {
        setMessage('最新の状態です。');
        return;
      }

      if (!initializedBeforeCheck && next.direction !== 'cloud-empty') {
        setNeedsInitialChoice(true);
        return;
      }

      if (next.direction === 'cloud-newer' && next.cloudBackup && next.cloudRevision !== null) {
        await pullCloudToLocal(next.cloudBackup, next.cloudRevision);
        setMessage('別の端末の最新データを反映しました。');
        window.setTimeout(() => window.location.reload(), 500);
        return;
      }

      if (next.direction === 'local-newer' || next.direction === 'cloud-empty') {
        await pushLocalToCloud();
        setPreview(await getDeviceSyncPreview());
        setMessage('最新の状態です。');
        return;
      }

      if (next.direction === 'conflict') {
        setShowDetails(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの同期を確認できませんでした。');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!plan.multiDeviceSync || !loggedIn) return;
    void runAutomaticSync();
    // 初回表示時だけ自動確認する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseCloud = async () => {
    if (!preview?.cloudBackup || preview.cloudRevision === null || running) return;
    const confirmed = window.confirm('別の端末に保存されているデータを、この端末で使います。実行しますか？');
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pullCloudToLocal(preview.cloudBackup, preview.cloudRevision);
      setMessage('別の端末のデータをこの端末へ反映しました。');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データを反映できませんでした。');
    } finally {
      setRunning(false);
    }
  };

  const handleUseThisDevice = async () => {
    if (running) return;
    const confirmed = window.confirm('この端末のデータを最新として保存します。別の端末のデータは置き換わります。実行しますか？');
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pushLocalToCloud();
      setPreview(await getDeviceSyncPreview());
      setNeedsInitialChoice(false);
      setMessage('この端末のデータを最新として保存しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'この端末のデータを保存できませんでした。');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>複数端末同期</Typography>
      <Typography color="text.secondary">
        Standard / Proでは、データの保存と同期を自動で行います。通常は操作する必要はありません。
      </Typography>

      {!plan.multiDeviceSync && <Alert severity="info">複数端末同期はStandard / Proプランで利用できます。</Alert>}
      {plan.multiDeviceSync && !loggedIn && <Alert severity="warning">複数端末同期を利用するにはログインが必要です。</Alert>}

      {plan.multiDeviceSync && loggedIn && authUser && (
        <Card><CardContent><Stack spacing={2}>
          <Table size="small"><TableBody>
            <TableRow><TableCell>農場</TableCell><TableCell>{authUser.farmName}</TableCell></TableRow>
            <TableRow><TableCell>利用者</TableCell><TableCell>{authUser.name}</TableCell></TableRow>
          </TableBody></Table>

          {running && <Alert severity="info">最新データを確認しています…</Alert>}

          {!running && message && <Alert severity="success">{message}</Alert>}

          {!running && !message && preview?.direction === 'same' && (
            <Alert severity="success">最新の状態です。</Alert>
          )}

          {!running && needsInitialChoice && preview && (
            <Stack spacing={2}>
              <Alert severity="warning">
                この端末と別の端末に異なるデータがあります。初回だけ、どちらを使うか確認してください。
              </Alert>
              <Button color="warning" variant="contained" size="large" onClick={handleUseCloud} disabled={!preview.cloudBackup || preview.cloudRevision === null} fullWidth>
                別の端末のデータを使う
              </Button>
              <Button variant="outlined" size="large" onClick={handleUseThisDevice} fullWidth>
                この端末のデータを使う
              </Button>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? '詳細を閉じる' : '違いを確認する'}
              </Button>
            </Stack>
          )}

          {!running && preview?.direction === 'conflict' && (
            <Stack spacing={2}>
              <Alert severity="error">
                別の端末でもこの端末でも変更されています。データを守るため、自動同期を停止しました。
              </Alert>
              <Typography fontWeight={700}>
                どちらを残すか確認が必要です。内容を確認してから操作してください。
              </Typography>
              <Button variant="outlined" onClick={() => setShowDetails((value) => !value)} fullWidth>
                {showDetails ? '詳細を閉じる' : '変更内容を確認する'}
              </Button>
            </Stack>
          )}

          {!running && preview?.direction !== 'conflict' && !needsInitialChoice && preview?.direction !== 'same' && (
            <Alert severity="info">同期状態を確認しました。</Alert>
          )}

          {showDetails && preview && (
            <Card variant="outlined"><CardContent><Stack spacing={1.5}>
              <Typography fontWeight={800}>同期の詳細</Typography>
              <Table size="small"><TableBody>
                <TableRow><TableCell>この端末の最終更新</TableCell><TableCell>{formatDate(preview.localUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>クラウドの最終更新</TableCell><TableCell>{formatDate(preview.cloudUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>この端末の件数</TableCell><TableCell>{preview.localRecordCount}件</TableCell></TableRow>
                <TableRow><TableCell>クラウドの件数</TableCell><TableCell>{preview.cloudRecordCount}件</TableCell></TableRow>
              </TableBody></Table>

              {preview.differences.map((diff) => (
                <Card key={diff.storeName} variant="outlined"><CardContent><Stack spacing={1}>
                  <Typography fontWeight={800}>{STORE_LABELS[diff.storeName]}</Typography>
                  <Typography variant="body2">
                    この端末のみ {diff.localOnly}件 / 別端末のみ {diff.cloudOnly}件 / 内容違い {diff.changed}件
                  </Typography>
                  {diff.localOnly > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      この端末のみID: {formatIds(diff.localOnlyIds, diff.localOnly)}
                    </Typography>
                  )}
                  {diff.cloudOnly > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      別端末のみID: {formatIds(diff.cloudOnlyIds, diff.cloudOnly)}
                    </Typography>
                  )}
                  {diff.changed > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      内容違いID: {formatIds(diff.changedIds, diff.changed)}
                    </Typography>
                  )}
                </Stack></CardContent></Card>
              ))}
            </Stack></CardContent></Card>
          )}

          {!running && preview?.direction === 'conflict' && (
            <Alert severity="warning">競合時は自動上書きしません。必要に応じてバックアップを保存してから対応してください。</Alert>
          )}

          {!running && !needsInitialChoice && preview?.direction !== 'conflict' && (
            <Button variant="text" onClick={runAutomaticSync} fullWidth>
              もう一度確認する
            </Button>
          )}
        </Stack></CardContent></Card>
      )}

      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
