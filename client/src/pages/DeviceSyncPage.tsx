import { useEffect, useRef, useState } from 'react';
import { Alert, Backdrop, Button, Card, CardContent, CircularProgress, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { createFarmProBackup, downloadFarmProBackup } from '../storage/backup';
import { getBeforeCloudReceiveBackup, receiveConfirmedCloudBackup } from '../services/cloudReceive';
import { planCloudOnlyBreedingAdditions, addReviewedBreedingWithoutOverwrite } from '../services/syncRecoveryBreeding';
import { markLocalChangePending } from '../services/deviceSync';
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
  const [breedingCandidates, setBreedingCandidates] = useState<ReturnType<typeof planCloudOnlyBreedingAdditions>['eligible']>([]);
  const [recoveryRevision, setRecoveryRevision] = useState<number | null>(null);
  const [mergeReport, setMergeReport] = useState<ReturnType<typeof inspectSyncMergeReadiness> | null>(null);
  // A direct link to this existing screen must not upload an old phone snapshot on entry.
  const [receiveMode] = useState(() => new URLSearchParams(window.location.search).get('receive') === 'cloud');
  const busy = useRef(false);
  const [receivingCloud, setReceivingCloud] = useState(false);
  const [receivedRevision, setReceivedRevision] = useState<number | null>(null);
  const [hasReceiveBackup, setHasReceiveBackup] = useState(false);

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

  // Read-only export: preserve both sides as separate snapshots for careful reconciliation.
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

  const inspectBreedingRecovery = async () => {
    if (running) return;
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
    if (running || recoveryRevision === null) return;
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
    if (!plan.multiDeviceSync || !loggedIn || running || busy.current) return;
    busy.current = true;
    setRunning(true);
    setMessage('');
    setError('');
    setNeedsInitialChoice(false);

    try {
      const initializedBeforeCheck = isDeviceSyncInitialized();
      const next = await refreshPreview();
      if (receiveMode) {
        setNeedsInitialChoice(next.direction !== 'same' && next.cloudRecordCount > 0);
        setMessage('クラウドの保存内容を確認しました。まだ受信・送信はしていません。');
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
      if (next.direction === 'conflict') setShowDetails(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの同期を確認できませんでした。');
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!plan.multiDeviceSync || !loggedIn) return;
    try { setHasReceiveBackup(Boolean(getBeforeCloudReceiveBackup())); } catch { /* Keep existing records intact. */ }
    void runAutomaticSync();
    // 初回表示時だけ自動確認する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUseCloud = async () => {
    if (!preview?.cloudBackup || preview.cloudRevision === null || running || exporting || busy.current) return;
    const selected = preview;
    if (selected.cloudBackup!.farm?.id !== authUser?.farmId) {
      setError('別の農場のデータは受信できません。'); return;
    }
    const confirmed = window.confirm(
      `農場：${selected.cloudBackup!.farm?.name || authUser?.farmName}\n保存日時：${formatDate(selected.cloudBackup!.exportedAt)}\nクラウド：${selected.cloudRecordCount}件（内部情報を除く）／世代${selected.cloudRevision}\n\nこの端末の現在の記録を自動退避してから、上記クラウドの内容へ入れ替えます。クラウドや他端末には送信しません。\n他のFarmPro画面・端末を閉じ、これを正しいデータとして受信しますか？`
    );
    if (!confirmed) return;
    busy.current = true;
    setRunning(true); setReceivingCloud(true); setMessage(''); setError('');
    try {
      await receiveConfirmedCloudBackup(selected.cloudBackup!, selected.cloudRevision!, true);
      setReceivedRevision(selected.cloudRevision);
      setNeedsInitialChoice(false); setShowDetails(false);
      setMessage(`受信完了：確認したクラウド${selected.cloudRecordCount}件（世代${selected.cloudRevision}）と、この端末の全内容の一致を確認しました。クラウドへの送信は行っていません。`);
      // Do not reload into other screens before the result can be reviewed.
      try { await refreshPreview(); }
      catch { setError('受信は完了していますが、最新の同期状態の再確認に失敗しました。受信を押し直さず、通信状態を確認してください。'); }
    } catch (err) {
      setError(err instanceof Error ? err.message : '受信できませんでした。');
    } finally {
      try { setHasReceiveBackup(Boolean(getBeforeCloudReceiveBackup())); } catch { /* Retain the underlying backup. */ }
      busy.current = false;
      setReceivingCloud(false); setRunning(false);
    }
  };

  const exportBeforeReceive = () => {
    if (running || exporting) return;
    try {
      const backup = getBeforeCloudReceiveBackup();
      if (!backup) throw new Error('受信前の退避データが見つかりません。');
      downloadFarmProBackup(backup);
    } catch (err) { setError(err instanceof Error ? err.message : '退避データを保存できませんでした。'); }
  };

  const handleUseThisDevice = async () => {
    if (preview?.direction === 'conflict') { setError('両方に変更があるため上書きできません。安全な差分統合が必要です。'); return; }
    if (running || receiveMode) return;
    const confirmed = window.confirm('この端末の農場データを最新としてクラウドに保存します。クラウド側の変更は置き換わります。続けますか？');
    if (!confirmed) return;
    setRunning(true); setMessage(''); setError('');
    try {
      await pushLocalToCloud();
      setPreview(await getDeviceSyncPreview());
      setNeedsInitialChoice(false); setShowDetails(false);
      setMessage('この端末の農場データを最新として保存しました。');
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'この端末のデータを保存できませんでした。');
    } finally { setRunning(false); }
  };

  return (
    <Stack spacing={2}>
      <Backdrop open={receivingCloud} sx={{ zIndex: (theme) => theme.zIndex.modal + 1, color: 'common.white' }}>
        <Stack spacing={2} alignItems="center"><CircularProgress color="inherit" /><Typography>退避・受信・内容照合を行っています。画面を閉じないでください。</Typography></Stack>
      </Backdrop>
      <Typography variant="h5" fontWeight={800}>複数端末同期</Typography>
      <Typography color="text.secondary">
        {receiveMode ? 'クラウドの保存内容を確認して、この端末へ受信します。この画面を開くだけでは送信・置換しません。' : 'Standard / Proでは、農場データをクラウドに保存し、同じアカウントの端末へ自動で反映します。通常は操作する必要はありません。'}
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

          {preview?.cloudBackup && preview.cloudRecordCount > 0 && receivedRevision === null && (
            <Stack spacing={1}>
              <Typography fontWeight={800}>クラウドから受け取る</Typography>
              <Typography>農場：{preview.cloudBackup.farm?.name || '名称なし'} ／ 世代{preview.cloudRevision}</Typography>
              <Typography>保存日時：{formatDate(preview.cloudBackup.exportedAt)} ／ {preview.cloudRecordCount}件（内部情報を除く）</Typography>
              <Typography variant="body2">この端末を自動退避してから入れ替えます。正しい保存内容であることを確認し、他のFarmPro画面・端末を閉じて実行してください。</Typography>
              <Button variant="contained" color="warning" onClick={handleUseCloud} disabled={running || exporting || preview.cloudBackup.farm?.id !== authUser.farmId} fullWidth>
                クラウドのデータをこの端末へ反映
              </Button>
            </Stack>
          )}
          {hasReceiveBackup && <Button variant="text" disabled={running || exporting} onClick={exportBeforeReceive}>受信前に退避したデータを保存</Button>}

          {!running && needsInitialChoice && preview && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方に農場データがあります。自動の全件上書きは停止しています。</Alert>
              <Alert severity="info">正本が確認できた場合だけ、上の「クラウドから受け取る」で退避後に受信できます。判断できない場合は差分を確認してください。</Alert>
              <Button variant="text" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? '詳細を閉じる' : 'データの違いを確認する'}
              </Button>
            </Stack>
          )}
          {!running && preview?.direction === 'conflict' && (
            <Stack spacing={2}>
              <Alert severity="warning">この端末とクラウドの両方で農場データが更新されています。安全のため、自動同期を一時停止しました。</Alert>
              <Alert severity="info">正本を確認できない場合は、両方のバックアップを保存して差分を照合してください。自動統合やクラウドへの強制上書きは行いません。</Alert>
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
            <Card variant="outlined"><CardContent><Stack spacing={1}>
              <Typography fontWeight={800}>記録の確認（同期トラブル時のみ）</Typography>
              <Typography variant="body2" color="text.secondary">同期できなかった繁殖記録を確認します。通常は操作不要です。確認した記録だけをこの端末に追加でき、既存記録は変更しません。</Typography>
              <Button variant="outlined" disabled={running} onClick={inspectBreedingRecovery} fullWidth>記録の違いを確認</Button>
              {breedingCandidates.map(candidate => (
                <Stack key={String(candidate.record.id)} spacing={1}>
                  <Typography variant="body2">{String(candidate.record.cowName ?? '')}（耳標{String(candidate.record.cowEarTag ?? '')}）／発情 {String(candidate.record.heatDate ?? '-')}／移植 {String(candidate.record.transferDate ?? '-')}</Typography>
                  <Button variant="outlined" disabled={running} onClick={() => void restoreReviewedBreeding(String(candidate.record.id))} fullWidth>この記録を追加</Button>
                </Stack>
              ))}
            </Stack></CardContent></Card>
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
