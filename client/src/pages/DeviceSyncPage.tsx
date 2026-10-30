import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { createFarmProBackup } from '../storage/backup';
import { proposeLosslessSyncMerge } from '../services/syncLosslessMerge';
import { inspectSyncMergeReadiness } from '../services/syncMergeReadiness';
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
  supplyInventory: '医薬品・受精卵在庫',
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
  const [exporting, setExporting] = useState(false);
  const [losslessReport, setLosslessReport] = useState<ReturnType<typeof proposeLosslessSyncMerge> | null>(null);
  const [mergeReport, setMergeReport] = useState<ReturnType<typeof inspectSyncMergeReadiness> | null>(null);

  const exportCloudBackup = async () => {
    if (exporting || running) return;
    setExporting(true); setError('');
    try {
      const next = await getDeviceSyncPreview();
      if (!next.cloudBackup) throw new Error('クラウドのバックアップが見つかりません。');
      const blob = new Blob([JSON.stringify(next.cloudBackup, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'farmpro-cloud-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link);
      link.click(); link.remove(); URL.revokeObjectURL(url);
      setMessage('クラウド側のバックアップを保存しました（農場データは変更していません）。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'クラウドのバックアップを保存できませんでした。');
    } finally { setExporting(false); }
  };

  // Read-only export: preserve both sides as separate snapshots for careful
  // reconciliation. Never restore or upload either snapshot here.
  const exportRecoveryBundle = async () => {
    if (exporting || running) return;
    setExporting(true); setError('');
    try {
      const local = await createFarmProBackup(__APP_VERSION__);
      const remote = await getDeviceSyncPreview();
      if (!remote.cloudBackup || remote.cloudRevision === null) {
        throw new Error('クラウドデータを取得できません。');
      }
      if (!local.farm?.id || local.farm.id !== remote.cloudBackup.farm?.id) {
        throw new Error('農場IDが一致しないため、照合データを作成できません。');
      }
      const bundle = {
        format: 'farmpro-sync-recovery-bundle',
        exportedAt: new Date().toISOString(),
        cloudRevision: remote.cloudRevision,
        local,
        cloud: remote.cloudBackup,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'farmpro-sync-recovery-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      setMessage('PCとクラウドの照合データを保存しました。記録は変更していません。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '照合データの保存に失敗しました。');
    } finally { setExporting(false); }
  };

  const refreshPreview = async () => {
    const next = await getDeviceSyncPreview();
    if (next.cloudBackup && next.direction !== 'same') {
      const local = await createFarmProBackup(__APP_VERSION__);
      setMergeReport(inspectSyncMergeReadiness(local, next.cloudBackup));
      setLosslessReport(proposeLosslessSyncMerge(local, next.cloudBackup));
    } else { setMergeReport(null); setLosslessReport(null); }
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

      // 新しい端末など、実データがまだ無い場合は既存のクラウドデータを自動で使う。
      if (next.localRecordCount === 0 && next.cloudRecordCount > 0 && next.cloudBackup && next.cloudRevision !== null) {
        await pullCloudToLocal(next.cloudBackup, next.cloudRevision);
        setMessage('農場データをこの端末に反映しました。');
        window.setTimeout(() => window.location.reload(), 500);
        return;
      }

      if (!initializedBeforeCheck && next.direction !== 'cloud-empty') {
        setNeedsInitialChoice(true);
        return;
      }

      if (next.direction === 'cloud-newer' && next.cloudBackup && next.cloudRevision !== null) {
        await pullCloudToLocal(next.cloudBackup, next.cloudRevision);
        setMessage('最新データをこの端末に反映しました。');
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
    if (preview?.direction === 'conflict' || needsInitialChoice) { setError('両方に変更があるため上書きできません。安全な差分統合が必要です。'); return; }
    if (!preview?.cloudBackup || preview.cloudRevision === null || running) return;
    const confirmed = window.confirm('クラウドに保存されている農場データをこの端末に反映します。この端末だけにある変更は置き換わります。続けますか？');
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pullCloudToLocal(preview.cloudBackup, preview.cloudRevision);
      setMessage('クラウドの農場データを反映しました。');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データを反映できませんでした。');
    } finally {
      setRunning(false);
    }
  };

  const handleUseThisDevice = async () => {
    if (preview?.direction === 'conflict') { setError('両方に変更があるため上書きできません。安全な差分統合が必要です。'); return; }
    if (running) return;
    const confirmed = window.confirm('この端末の農場データを最新としてクラウドに保存します。クラウド側の変更は置き換わります。続けますか？');
    if (!confirmed) return;

    setRunning(true);
    setMessage('');
    setError('');
    try {
      await pushLocalToCloud();
      setPreview(await getDeviceSyncPreview());
      setNeedsInitialChoice(false);
      setShowDetails(false);
      setMessage('この端末の農場データを最新として保存しました。');
      window.setTimeout(() => window.location.reload(), 500);
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
        Standard / Proでは、農場データをクラウドに保存し、同じアカウントの端末へ自動で反映します。通常は操作する必要はありません。
      </Typography>

      {!plan.multiDeviceSync && <Alert severity="info">複数端末同期はStandard / Proプランで利用できます。</Alert>}
      {plan.multiDeviceSync && !loggedIn && <Alert severity="warning">複数端末同期を利用するにはログインが必要です。</Alert>}

      {plan.multiDeviceSync && loggedIn && authUser && (
        <Card><CardContent><Stack spacing={2}>
          <Table size="small"><TableBody>
            <TableRow><TableCell>農場</TableCell><TableCell>{authUser.farmName}</TableCell></TableRow>
            <TableRow><TableCell>利用者</TableCell><TableCell>{authUser.name}</TableCell></TableRow>
          </TableBody></Table>

          {running && <Alert severity="info">農場データを確認しています…</Alert>}
          {!running && message && <Alert severity="success">{message}</Alert>}
          {!running && !message && preview?.direction === 'same' && <Alert severity="success">最新の状態です。</Alert>}

          {!running && needsInitialChoice && preview && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方に農場データがあります。最初の1回だけ、どちらを基準にするか確認してください。</Alert>
              <Alert severity="error">初回同期でPC・クラウドの両方に記録があります。どちらかを選ぶと記録が失われるため、全件上書きは停止しています。差分を確認してから個別に統合してください。</Alert>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? '詳細を閉じる' : 'データの違いを確認する'}
              </Button>
            </Stack>
          )}

          {!running && preview?.direction === 'conflict' && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方で農場データが更新されています。安全のため、自動同期を一時停止しました。</Alert>
              <Alert severity="error">PC・クラウド双方に固有の記録や内容違いがあります。どちらか一方の全件上書きはデータ消失につながるため、この画面からは実行できません。両方のバックアップを保存してから差分を照合してください。</Alert>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)} fullWidth>
                {showDetails ? '詳細を閉じる' : 'データの違いを確認する'}
              </Button>
            </Stack>
          )}

          {!running && preview?.direction !== 'conflict' && !needsInitialChoice && preview?.direction !== 'same' && <Alert severity="info">同期状態を確認しました。</Alert>}

          {mergeReport && (preview?.direction === 'conflict' || needsInitialChoice) && (
            <Alert severity="warning">
              安全確認：クラウド未登録 {mergeReport.missingFromCloud}件／この端末に未登録 {mergeReport.missingFromDevice}件／同じIDで内容相違 {mergeReport.sameIdDifferentContent}件。
              {mergeReport.farmMismatch ? '農場IDも異なります。' : ''}
              自動統合は行わず、既存データを保持しています。
            </Alert>
          )}
          {losslessReport && (preview?.direction === 'conflict' || needsInitialChoice) && (
            <Alert severity="info">
              安全な統合の事前判定：クラウドへ追加候補 {losslessReport.additionsToCloud}件、この端末へ追加候補 {losslessReport.additionsToDevice}件、
              要照合 {losslessReport.unresolved.length}件。牛の個体識別や経費・在庫の連動を確認するまで自動統合しません。
            </Alert>
          )}
          {preview?.cloudBackup && (
            <Button variant="contained" onClick={exportRecoveryBundle} disabled={exporting || running} fullWidth>
              PC・クラウドの同期復旧データを保存（上書きなし）
            </Button>
          )}
          {preview?.cloudBackup && (
            <Button variant="outlined" onClick={exportCloudBackup} disabled={exporting || running} fullWidth>
              {exporting ? '保存中…' : 'クラウド側のバックアップを保存（上書きなし）'}
            </Button>
          )}
          {showDetails && preview && (
            <Card variant="outlined"><CardContent><Stack spacing={1.5}>
              <Typography fontWeight={800}>データの違い</Typography>
              <Table size="small"><TableBody>
                <TableRow><TableCell>この端末の最終更新</TableCell><TableCell>{formatDate(preview.localUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>クラウドの最終更新</TableCell><TableCell>{formatDate(preview.cloudUpdatedAt)}</TableCell></TableRow>
                <TableRow><TableCell>この端末の件数</TableCell><TableCell>{preview.localRecordCount}件</TableCell></TableRow>
                <TableRow><TableCell>クラウドの件数</TableCell><TableCell>{preview.cloudRecordCount}件</TableCell></TableRow>
              </TableBody></Table>

              {preview.differences.map((diff) => (
                <Card key={diff.storeName} variant="outlined"><CardContent><Stack spacing={1}>
                  <Typography fontWeight={800}>{STORE_LABELS[diff.storeName]}</Typography>
                  <Typography variant="body2">この端末のみ {diff.localOnly}件 / クラウドのみ {diff.cloudOnly}件 / 内容違い {diff.changed}件</Typography>
                  {diff.localOnly > 0 && <Typography variant="body2" color="text.secondary">この端末のみID: {formatIds(diff.localOnlyIds, diff.localOnly)}</Typography>}
                  {diff.cloudOnly > 0 && <Typography variant="body2" color="text.secondary">クラウドのみID: {formatIds(diff.cloudOnlyIds, diff.cloudOnly)}</Typography>}
                  {diff.changed > 0 && <Typography variant="body2" color="text.secondary">内容違いID: {formatIds(diff.changedIds, diff.changed)}</Typography>}
                </Stack></CardContent></Card>
              ))}
            </Stack></CardContent></Card>
          )}

          {!running && !needsInitialChoice && preview?.direction !== 'conflict' && (
            <Button variant="text" onClick={runAutomaticSync} fullWidth>もう一度確認する</Button>
          )}
        </Stack></CardContent></Card>
      )}

      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export default DeviceSyncPage;
