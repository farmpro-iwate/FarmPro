import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, CardContent, Checkbox, FormControlLabel, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { createFarmProBackup } from '../storage/backup';
import { planCloudOnlyBreedingAdditions, addReviewedBreedingWithoutOverwrite } from '../services/syncRecoveryBreeding';
import { markLocalChangePending } from '../services/deviceSync';
import { proposeLosslessSyncMerge } from '../services/syncLosslessMerge';
import { inspectSyncMergeReadiness } from '../services/syncMergeReadiness';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { FARM_PRO_PLANS } from '../plans/policy';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import {
  applyCloudRecovery,
  cancelCloudRecovery,
  canUseCloudRecovery,
  getPendingCloudRecovery,
  prepareCloudRecovery,
  verifyAndResumeCloudRecovery,
  type CloudRecoveryPreview,
} from '../services/cloudDeviceRecovery';
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
  const cloudRecoveryAvailable = canUseCloudRecovery();
  const [preview, setPreview] = useState<DeviceSyncPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [needsInitialChoice, setNeedsInitialChoice] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [losslessReport, setLosslessReport] = useState<ReturnType<typeof proposeLosslessSyncMerge> | null>(null);
  const [breedingCandidates, setBreedingCandidates] = useState<ReturnType<typeof planCloudOnlyBreedingAdditions>['eligible']>([]);
  const [recoveryRevision, setRecoveryRevision] = useState<number | null>(null);
  const [mergeReport, setMergeReport] = useState<ReturnType<typeof inspectSyncMergeReadiness> | null>(null);
  const [cloudRecovery, setCloudRecovery] = useState<CloudRecoveryPreview | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(!cloudRecoveryAvailable);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryPhase, setRecoveryPhase] = useState('');
  const recoveryOperation = useRef(false);
  const recoveryActive = Boolean(cloudRecovery && cloudRecovery.status !== 'verified');
  const recoveryBlocksOtherActions = cloudRecoveryAvailable && (!recoveryLoaded || Boolean(recoveryPhase) || recoveryActive);

  const performRecovery = async (phase: string, action: () => Promise<void>) => {
    if (recoveryOperation.current || running || exporting) return;
    recoveryOperation.current = true;
    setRecoveryPhase(phase);
    setRecoveryError('');
    setRecoveryMessage('');
    try {
      await action();
    } catch (cause) {
      setRecoveryConfirmed(false);
      setRecoveryError(cause instanceof Error ? cause.message : '受信処理を確認できませんでした。');
      // An interrupted response can follow a completed local transaction.
      // Recover the persisted state before offering another action.
      try {
        const pending = await getPendingCloudRecovery();
        if (pending) {
          setCloudRecovery(pending);
          setRecoveryLoaded(true);
        }
      } catch { /* Keep the last known protected state and the original error. */ }
    } finally {
      recoveryOperation.current = false;
      setRecoveryPhase('');
    }
  };

  const loadRecovery = () => performRecovery('受信の保存状態を確認しています…', async () => {
    const pending = await getPendingCloudRecovery();
    setCloudRecovery(pending);
    setRecoveryConfirmed(false);
    setRecoveryLoaded(true);
    if (!pending) await refreshPreview();
  });

  const prepareRecovery = () => performRecovery('自動同期を止め、変更前データの退避と正本の確認をしています…', async () => {
    setRecoveryConfirmed(false);
    const next = await prepareCloudRecovery();
    setCloudRecovery(next);
    setRecoveryLoaded(true);
    setMessage('');
    setError('');
  });

  const applyRecovery = () => {
    if (!cloudRecovery || !recoveryConfirmed || !['prepared', 'failed'].includes(cloudRecovery.status)) return;
    return performRecovery('クラウドの正本を受信し、全内容を照合しています…', async () => {
      const result = await applyCloudRecovery(cloudRecovery.id);
      setCloudRecovery({ ...cloudRecovery, status: result.verified ? 'verified' : 'applied' });
      setRecoveryConfirmed(false);
    });
  };

  const verifyRecovery = () => {
    if (!cloudRecovery) return;
    return performRecovery('通常同期後の内容と重複を確認しています…', async () => {
      const result = await verifyAndResumeCloudRecovery(cloudRecovery.id);
      if (!result.verified) throw new Error('通常同期の確認が完了していません。受信の保存状態を再確認してください。');
      setCloudRecovery({ ...cloudRecovery, status: 'verified' });
      setRecoveryConfirmed(false);
    });
  };

  const cancelRecovery = () => {
    if (!cloudRecovery || !['prepared', 'failed'].includes(cloudRecovery.status)) return;
    return performRecovery('受信の確認を取り消しています…', async () => {
      await cancelCloudRecovery(cloudRecovery.id);
      setCloudRecovery(null);
      setRecoveryConfirmed(false);
      setRecoveryMessage('受信を取り消しました。この端末の記録は変更していません。');
    });
  };

  const exportCloudBackup = async () => {
    if (exporting || running || recoveryBlocksOtherActions) return;
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
    if (exporting || running || recoveryBlocksOtherActions) return;
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

  const inspectBreedingRecovery = async () => {
    if (running || recoveryBlocksOtherActions) return;
    setRunning(true); setError(''); setMessage('');
    try {
      const next = await getDeviceSyncPreview();
      if (!next.cloudBackup || next.cloudRevision === null) throw new Error('クラウド記録を取得できません');
      const local = await createFarmProBackup(__APP_VERSION__);
      const result = planCloudOnlyBreedingAdditions(local, next.cloudBackup);
      setBreedingCandidates(result.eligible);
      setRecoveryRevision(next.cloudRevision);
      setMessage(`追加候補 ${result.eligible.length}件・要照合 ${result.blocked.length}件。候補はまだ保存されていません。`);
    } catch (cause) {
      setBreedingCandidates([]); setRecoveryRevision(null);
      setError(cause instanceof Error ? cause.message : '復旧候補を確認できませんでした');
    } finally { setRunning(false); }
  };

  const restoreReviewedBreeding = async (id: string) => {
    if (running || recoveryBlocksOtherActions || recoveryRevision === null) return;
    const candidate = breedingCandidates.find(item => String(item.record.id) === id);
    if (!candidate) return;
    const row = candidate.record;
    const confirmed = window.confirm(
      `以下の繁殖記録を、この端末へ1件だけ追加します。既存記録は変更しません。\\n牛: ${String(row.cowName ?? '')}（耳標${String(row.cowEarTag ?? '')}）\\n発情: ${String(row.heatDate ?? '-')} ／ 授精: ${String(row.inseminationDate ?? '-')} ／ 移植: ${String(row.transferDate ?? '-')}\\n記録ID: ${id}\\n続けますか？`
    );
    if (!confirmed) return;
    setRunning(true); setError(''); setMessage('');
    try {
      const next = await getDeviceSyncPreview();
      if (next.cloudRevision !== recoveryRevision || !next.cloudBackup) {
        throw new Error('クラウドが更新されました。候補を再確認してください');
      }
      const local = await createFarmProBackup(__APP_VERSION__);
      const checked = planCloudOnlyBreedingAdditions(local, next.cloudBackup).eligible
        .find(item => String(item.record.id) === id);
      if (!checked || JSON.stringify(checked.record) !== JSON.stringify(row)) {
        throw new Error('記録の内容が変わりました。復旧候補を再確認してください');
      }
      await addReviewedBreedingWithoutOverwrite(checked.record);
      markLocalChangePending();
      setBreedingCandidates([]);
      setRecoveryRevision(null);
      setMessage('繁殖記録を1件追加しました。クラウド側の記録は変更していません。');
      await refreshPreview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '復旧できませんでした');
    } finally { setRunning(false); }
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
    if (!plan.multiDeviceSync || !loggedIn || running || recoveryBlocksOtherActions) return;

    setRunning(true);
    setMessage('');
    setError('');
    setNeedsInitialChoice(false);

    try {
      const initializedBeforeCheck = isDeviceSyncInitialized();
      const next = await refreshPreview();

      // The recovery farm must explicitly review its saved PC source before
      // any receive. Opening this page or refreshing it is read-only.
      if (cloudRecoveryAvailable) {
        setMessage('現在の同期状態を読み取りました。正本の受信は、内容を確認してから確定してください。');
        return;
      }

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
    if (cloudRecoveryAvailable) void loadRecovery();
    else void runAutomaticSync();
    // 初回表示時だけ自動確認する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseCloud = async () => {
    if (cloudRecoveryAvailable || recoveryBlocksOtherActions) return;
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
    if (cloudRecoveryAvailable || recoveryBlocksOtherActions) return;
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
        {cloudRecoveryAvailable
          ? 'クラウドに保存済みのPC正本を、この端末へ直接受信して同期を復旧します。'
          : 'Standard / Proでは、農場データをクラウドに保存し、同じアカウントの端末へ自動で反映します。通常は操作する必要はありません。'}
      </Typography>

      {!plan.multiDeviceSync && <Alert severity="info">複数端末同期はStandard / Proプランで利用できます。</Alert>}
      {plan.multiDeviceSync && !loggedIn && <Alert severity="warning">複数端末同期を利用するにはログインが必要です。</Alert>}
      {!loggedIn && <Button component="a" href={`${import.meta.env.BASE_URL}login`}>ログイン画面を開く</Button>}

      {plan.multiDeviceSync && loggedIn && authUser && (
        <Card><CardContent><Stack spacing={2}>
          <Table size="small"><TableBody>
            <TableRow><TableCell>農場</TableCell><TableCell>{authUser.farmName}</TableCell></TableRow>
            <TableRow><TableCell>利用者</TableCell><TableCell>{authUser.name}</TableCell></TableRow>
          </TableBody></Table>

          {cloudRecoveryAvailable && (
            <Card variant="outlined"><CardContent><Stack spacing={2}>
              <Typography component="h2" variant="h6" fontWeight={800}>クラウドの正本をこの端末へ受信</Typography>
              <Typography variant="body2" color="text.secondary">
                変更前データをこの端末内に退避してから、農場と受信内容を表示します。内容を確認して確定すると、この端末の記録を正本に揃えます。
              </Typography>
              {recoveryPhase && <Alert severity="info" role="status">{recoveryPhase}</Alert>}
              {recoveryError && <Alert severity="error">{recoveryError}</Alert>}
              {recoveryMessage && <Alert severity="info">{recoveryMessage}</Alert>}
              {!recoveryLoaded && !recoveryPhase && (
                <Button variant="outlined" onClick={() => void loadRecovery()} fullWidth>受信の保存状態を再確認</Button>
              )}
              {recoveryLoaded && !cloudRecovery && (
                <Button variant="contained" disabled={Boolean(recoveryPhase) || running || exporting} onClick={() => void prepareRecovery()} fullWidth>
                  変更前データを退避して受信内容を確認
                </Button>
              )}
              {cloudRecovery && (
                <>
                  <Table size="small" aria-label="正本の受信情報" sx={{ tableLayout: 'fixed' }}><TableBody>
                    <TableRow><TableCell sx={{ width: '38%' }}>受信する農場</TableCell><TableCell>{cloudRecovery.farmName}</TableCell></TableRow>
                    <TableRow><TableCell>農場ID</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{cloudRecovery.farmId}</TableCell></TableRow>
                    <TableRow><TableCell>PC正本の記録日時</TableCell><TableCell>{formatDate(cloudRecovery.sourceExportedAt)}</TableCell></TableRow>
                    <TableRow><TableCell>クラウドの保存日時</TableCell><TableCell>{formatDate(cloudRecovery.cloudSavedAt)}</TableCell></TableRow>
                    <TableRow><TableCell>確認した世代</TableCell><TableCell>{cloudRecovery.cloudRevision}</TableCell></TableRow>
                    <TableRow><TableCell>変更前データの退避</TableCell><TableCell>{formatDate(cloudRecovery.beforeSavedAt)}（退避済み）</TableCell></TableRow>
                  </TableBody></Table>
                  <Table size="small" aria-label="受信前と正本の件数" sx={{ tableLayout: 'fixed' }}>
                    <TableHead><TableRow><TableCell sx={{ width: '46%' }}>記録</TableCell><TableCell align="right">変更前</TableCell><TableCell align="right">正本</TableCell></TableRow></TableHead>
                    <TableBody>
                      <TableRow><TableCell sx={{ fontWeight: 800 }}>業務データ合計</TableCell><TableCell align="right">{cloudRecovery.localRecordCount}件</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>{cloudRecovery.cloudRecordCount}件</TableCell></TableRow>
                      <TableRow><TableCell>内部情報を含む合計</TableCell><TableCell align="right">{cloudRecovery.localTotalCount}件</TableCell><TableCell align="right">{cloudRecovery.cloudTotalCount}件</TableCell></TableRow>
                      {[...cloudRecovery.counts].sort((left, right) => {
                        const order = (name: string) => name === 'calves' ? 0 : name === 'supplyInventory' ? 1 : 2;
                        return order(left.storeName) - order(right.storeName);
                      }).map(count => (
                        <TableRow key={count.storeName}>
                          <TableCell>{STORE_LABELS[count.storeName]}</TableCell>
                          <TableCell align="right">{count.local}件</TableCell>
                          <TableCell align="right">{count.cloud}件</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {cloudRecovery.status === 'prepared' && (
                    <Alert severity="info">変更前データは退避済みです。受信を確定するまで、この端末の記録は置き換えません。自動同期は停止しています。</Alert>
                  )}
                  {cloudRecovery.alreadyMatches && cloudRecovery.status === 'prepared' && (
                    <Alert severity="info">この端末は正本と一致しています。置換は行わず、同期の再開を確認します。</Alert>
                  )}
                  {['prepared', 'failed'].includes(cloudRecovery.status) && (
                    <>
                      <FormControlLabel control={<Checkbox checked={recoveryConfirmed} disabled={Boolean(recoveryPhase)} onChange={(_, checked) => setRecoveryConfirmed(checked)} />} label="この端末の他のFarmPro画面を閉じ、最新版で開き、農場と受信内容を確認しました" />
                      <Button variant="contained" disabled={!recoveryConfirmed || Boolean(recoveryPhase)} onClick={() => void applyRecovery()} fullWidth>
                        {cloudRecovery.alreadyMatches ? 'この内容で同期の再開準備を確定' : 'この内容を受信して確定'}
                      </Button>
                      <Button variant="text" disabled={Boolean(recoveryPhase)} onClick={() => void cancelRecovery()} fullWidth>受信を取り消す</Button>
                    </>
                  )}
                  {cloudRecovery.status === 'applied' && (
                    <Alert severity="info">受信済みです。正本との全内容の一致を確認しました。通常同期の検証が残っています。</Alert>
                  )}
                  {['applying', 'failed'].includes(cloudRecovery.status) && !recoveryPhase && (
                    <Alert severity="warning">受信処理の完了をまだ確認できていません。自動同期を止めたまま、保存状態を確認します。</Alert>
                  )}
                  {['applied', 'applying', 'failed'].includes(cloudRecovery.status) && (
                    <Button variant="contained" disabled={Boolean(recoveryPhase)} onClick={() => void verifyRecovery()} fullWidth>
                      通常同期を検証して再開
                    </Button>
                  )}
                  {['applying', 'failed'].includes(cloudRecovery.status) && (
                    <Button variant="outlined" disabled={Boolean(recoveryPhase)} onClick={() => void prepareRecovery()} fullWidth>受信内容を再確認</Button>
                  )}
                  {cloudRecovery.status === 'verified' && (
                    <>
                      <Alert severity="success">正本との全内容照合と、通常同期後も内容が一致することを確認しました。この端末の通常同期を再開しました。現在{cloudRecovery.cloudRecordCount}件（内部情報を含め{cloudRecovery.cloudTotalCount}件）です。</Alert>
                      <Button component="a" href={import.meta.env.BASE_URL} variant="outlined" fullWidth>通常の画面を開く</Button>
                    </>
                  )}
                </>
              )}
            </Stack></CardContent></Card>
          )}

          {running && <Alert severity="info">農場データを確認しています…</Alert>}
          {!running && !recoveryActive && message && <Alert severity={cloudRecoveryAvailable ? 'info' : 'success'}>{message}</Alert>}
          {!cloudRecoveryAvailable && !running && !message && preview?.direction === 'same' && <Alert severity="success">最新の状態です。</Alert>}

          {!cloudRecoveryAvailable && !running && needsInitialChoice && preview && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方に農場データがあります。最初の1回だけ、どちらを基準にするか確認してください。</Alert>
              <Alert severity="error">初回同期でPC・クラウドの両方に記録があります。どちらかを選ぶと記録が失われるため、全件上書きは停止しています。差分を確認してから個別に統合してください。</Alert>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? '詳細を閉じる' : 'データの違いを確認する'}
              </Button>
            </Stack>
          )}

          {!cloudRecoveryAvailable && !running && preview?.direction === 'conflict' && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方で農場データが更新されています。安全のため、自動同期を一時停止しました。</Alert>
              <Alert severity="error">PC・クラウド双方に固有の記録や内容違いがあります。どちらか一方の全件上書きはデータ消失につながるため、この画面からは実行できません。両方のバックアップを保存してから差分を照合してください。</Alert>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)} fullWidth>
                {showDetails ? '詳細を閉じる' : 'データの違いを確認する'}
              </Button>
            </Stack>
          )}

          {!cloudRecoveryAvailable && !running && preview?.direction !== 'conflict' && !needsInitialChoice && preview?.direction !== 'same' && <Alert severity="info">同期状態を確認しました。</Alert>}

          {!cloudRecoveryAvailable && mergeReport && (preview?.direction === 'conflict' || needsInitialChoice) && (
            <Alert severity="warning">
              安全確認：クラウド未登録 {mergeReport.missingFromCloud}件／この端末に未登録 {mergeReport.missingFromDevice}件／同じIDで内容相違 {mergeReport.sameIdDifferentContent}件。
              {mergeReport.farmMismatch ? '農場IDも異なります。' : ''}
              自動統合は行わず、既存データを保持しています。
            </Alert>
          )}
          {!cloudRecoveryAvailable && losslessReport && (preview?.direction === 'conflict' || needsInitialChoice) && (
            <Alert severity="info">
              安全な統合の事前判定：クラウドへ追加候補 {losslessReport.additionsToCloud}件、この端末へ追加候補 {losslessReport.additionsToDevice}件、
              要照合 {losslessReport.unresolved.length}件。牛の個体識別や経費・在庫の連動を確認するまで自動統合しません。
            </Alert>
          )}
          {!cloudRecoveryAvailable && preview?.cloudBackup && (
            <Button variant="contained" onClick={exportRecoveryBundle} disabled={exporting || running || recoveryBlocksOtherActions} fullWidth>
              PC・クラウドの同期復旧データを保存（上書きなし）
            </Button>
          )}
          {!cloudRecoveryAvailable && preview?.cloudBackup && (
            <Card variant="outlined"><CardContent><Stack spacing={1}>
              <Typography fontWeight={800}>記録の確認（同期トラブル時のみ）</Typography>
              <Typography variant="body2" color="text.secondary">同期できなかった繁殖記録を確認します。通常は操作不要です。確認した記録だけをこの端末に追加でき、既存記録は変更しません。</Typography>
              <Button variant="outlined" disabled={running || recoveryBlocksOtherActions} onClick={inspectBreedingRecovery} fullWidth>記録の違いを確認</Button>
              {breedingCandidates.map(candidate => (
                <Stack key={String(candidate.record.id)} spacing={1}>
                  <Typography variant="body2">{String(candidate.record.cowName ?? '')}（耳標{String(candidate.record.cowEarTag ?? '')}）／発情 {String(candidate.record.heatDate ?? '-')}／移植 {String(candidate.record.transferDate ?? '-')}</Typography>
                  <Button variant="outlined" disabled={running || recoveryBlocksOtherActions} onClick={() => void restoreReviewedBreeding(String(candidate.record.id))} fullWidth>この記録を追加</Button>
                </Stack>
              ))}
            </Stack></CardContent></Card>
          )}
          {!cloudRecoveryAvailable && preview?.cloudBackup && (
            <Button variant="outlined" onClick={exportCloudBackup} disabled={exporting || running || recoveryBlocksOtherActions} fullWidth>
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

          {!running && !needsInitialChoice && (cloudRecoveryAvailable || preview?.direction !== 'conflict') && (
            <Button variant="text" disabled={recoveryBlocksOtherActions} onClick={runAutomaticSync} fullWidth>もう一度確認する</Button>
          )}
        </Stack></CardContent></Card>
      )}

      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export default DeviceSyncPage;
