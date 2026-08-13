import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Divider, MenuItem, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettings, updateFarmSettings } from '../services/settingsApi';
import { createMaster, getMasterList } from '../services/masterApi';
import { createFarmProBackup, downloadFarmProBackup } from '../storage/backup';
import { readFarmProBackupFile } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { FARM_PRO_PLANS, type FarmProPlanId } from '../plans/policy';
import { getCurrentFarmProPlanId, setCurrentFarmProPlanId } from '../plans/current-plan';
import { getStoredAuthUser, hasAuthToken, logout, type AuthUser } from '../services/authClient';
import { saveToCloud } from '../services/cloudFeatures';

const emptySettings: FarmSettings = {
  farmName: '', ownerName: '', staffName: '', phone: '', address: '', estrousCycleDays: 21,
  bullMasters: [], supplierMasters: [], memo: ''
};

function display(value: string) { return value || '-'; }
function normalizeList(value?: string[]) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function normalizeCandidates(value?: string[]) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const name = (item || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

export function SettingsPage() {
  const [form, setForm] = useState<FarmSettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [saved, setSaved] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [planId, setPlanId] = useState<FarmProPlanId>(() => getCurrentFarmProPlanId());
  const [planMessage, setPlanMessage] = useState('');
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [cloudSaving, setCloudSaving] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudError, setCloudError] = useState('');
  const [importResult, setImportResult] = useState<{
    targetCount: number;
    createdCount: number;
    skippedCount: number;
  } | null>(null);

  useEffect(() => {
    getFarmSettings().then((data) => setForm({
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

  const handlePlanChange = (nextPlanId: FarmProPlanId) => {
    setCurrentFarmProPlanId(nextPlanId);
    setPlanId(nextPlanId);
    setPlanMessage(`${FARM_PRO_PLANS[nextPlanId].label} プランに切り替えました。`);
    setCloudMessage('');
    setCloudError('');
  };

  const handleLogout = () => {
    logout();
    setAuthUser(null);
    setCloudMessage('');
    setCloudError('');
  };

  const handleCloudSave = async () => {
    setCloudSaving(true);
    setCloudMessage('');
    setCloudError('');

    try {
      const result = await saveToCloud();
      const savedAt = new Date(result.savedAt).toLocaleString('ja-JP');
      setCloudMessage(`クラウドへ保存しました。保存日時: ${savedAt}`);
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'クラウド保存に失敗しました。');
    } finally {
      setCloudSaving(false);
    }
  };

  const handleSave = async () => {
    const savedSettings = await updateFarmSettings(form);
    setForm({
      ...emptySettings,
      ...savedSettings,
      bullMasters: normalizeList(savedSettings.bullMasters),
      supplierMasters: normalizeList(savedSettings.supplierMasters)
    });
    setSaved(true);
  };

  const handleBackup = async () => {
    setBackupSaving(true);
    setBackupMessage('');
    setBackupError('');

    try {
      const backup = await createFarmProBackup(__APP_VERSION__);
      downloadFarmProBackup(backup);
      setBackupMessage('バックアップを保存しました。');
    } catch (error) {
      console.error('バックアップの保存に失敗しました。', error);
      setBackupError('バックアップを保存できませんでした。');
    } finally {
      setBackupSaving(false);
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setRestoreRunning(true);
    setRestoreMessage('');
    setRestoreError('');

    try {
      const backup = await readFarmProBackupFile(file);
      await restoreFarmProBackup(backup);
      setRestoreMessage('バックアップから復元しました。画面を再読み込みします。');
      window.location.reload();
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'バックアップの復元に失敗しました。');
    } finally {
      setRestoreRunning(false);
    }
  };

  const handleImportLegacyMasters = async () => {
    const legacySires = normalizeCandidates(form.bullMasters);
    const legacyPartners = normalizeCandidates(form.supplierMasters);
    const targetCount = legacySires.length + legacyPartners.length;

    setImportResult(null);
    setImportError('');
    if (targetCount === 0) {
      setImportResult({ targetCount: 0, createdCount: 0, skippedCount: 0 });
      return;
    }

    const confirmed = window.confirm(
      '旧候補を共通マスターへ取り込みます。\n\n' +
      '・種雄牛候補 → 種雄牛マスター\n' +
      '・購入先候補 → 取引先マスター\n' +
      '・同名の有効マスターは重複登録しません\n' +
      '・元の旧候補データは削除しません\n\n' +
      '取り込みを実行しますか？'
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const [sireMasters, partnerMasters] = await Promise.all([
        getMasterList('sire'),
        getMasterList('partner')
      ]);
      const activeSireNames = new Set(sireMasters.filter((m) => m.active).map((m) => m.name.trim()));
      const activePartnerNames = new Set(partnerMasters.filter((m) => m.active).map((m) => m.name.trim()));
      let createdCount = 0;
      let skippedCount = 0;

      for (const name of legacySires) {
        if (activeSireNames.has(name)) { skippedCount += 1; continue; }
        await createMaster({ category: 'sire', name });
        activeSireNames.add(name);
        createdCount += 1;
      }

      for (const name of legacyPartners) {
        if (activePartnerNames.has(name)) { skippedCount += 1; continue; }
        await createMaster({ category: 'partner', name });
        activePartnerNames.add(name);
        createdCount += 1;
      }

      setImportResult({ targetCount, createdCount, skippedCount });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '旧候補の取り込みに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <Typography>読み込み中...</Typography>;
  const currentPlan = FARM_PRO_PLANS[planId];
  const loggedIn = Boolean(authUser && hasAuthToken());

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} className="no-print">
        <Typography variant="h5" fontWeight={800}>農場設定</Typography>
        <Button variant="contained" onClick={() => window.print()} sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, whiteSpace: 'nowrap' }}>印刷する</Button>
      </Stack>

      <Card className="no-print"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>利用プラン</Typography>
        <Typography color="text.secondary">有料版開発中の確認用です。切り替えたプランは登録上限と有料機能判定に反映されます。</Typography>
        <TextField select label="現在のプラン" value={planId} onChange={(e) => handlePlanChange(e.target.value as FarmProPlanId)} fullWidth>
          {Object.values(FARM_PRO_PLANS).map((plan) => <MenuItem key={plan.id} value={plan.id}>{plan.label}</MenuItem>)}
        </TextField>
        <Table size="small"><TableBody>
          <TableRow><TableCell>繁殖雌牛の上限</TableCell><TableCell>{currentPlan.maxBreedingFemales === null ? '無制限' : `${currentPlan.maxBreedingFemales}頭`}</TableCell></TableRow>
          <TableRow><TableCell>クラウド保存</TableCell><TableCell>{currentPlan.cloudStorage ? '利用可能' : '対象外'}</TableCell></TableRow>
          <TableRow><TableCell>自動バックアップ</TableCell><TableCell>{currentPlan.automaticBackup ? '利用可能' : '対象外'}</TableCell></TableRow>
          <TableRow><TableCell>複数端末同期</TableCell><TableCell>{currentPlan.multiDeviceSync ? '利用可能' : '対象外'}</TableCell></TableRow>
        </TableBody></Table>
        {planMessage && <Alert severity="success">{planMessage}</Alert>}
      </Stack></CardContent></Card>

      <Card className="no-print"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>クラウド保存</Typography>
        {!currentPlan.cloudStorage && (
          <Alert severity="info">クラウド保存はStandard / Proプランで利用できます。</Alert>
        )}
        {currentPlan.cloudStorage && !loggedIn && (
          <>
            <Alert severity="warning">クラウド保存を利用するにはログインが必要です。</Alert>
            <Button component={RouterLink} to="/login" variant="contained" size="large" fullWidth sx={{ minHeight: 52, fontWeight: 800 }}>ログインする</Button>
          </>
        )}
        {currentPlan.cloudStorage && loggedIn && authUser && (
          <>
            <Table size="small"><TableBody>
              <TableRow><TableCell>ログイン状態</TableCell><TableCell>ログイン済み</TableCell></TableRow>
              <TableRow><TableCell>農場</TableCell><TableCell>{authUser.farmName}</TableCell></TableRow>
              <TableRow><TableCell>利用者</TableCell><TableCell>{authUser.name}</TableCell></TableRow>
              <TableRow><TableCell>メール</TableCell><TableCell>{authUser.email}</TableCell></TableRow>
            </TableBody></Table>
            <Button variant="contained" size="large" onClick={handleCloudSave} disabled={cloudSaving} fullWidth sx={{ minHeight: 52, fontWeight: 800 }}>
              {cloudSaving ? 'クラウドへ保存中…' : 'クラウドへ保存'}
            </Button>
            <Button variant="outlined" onClick={handleLogout}>ログアウト</Button>
          </>
        )}
        {cloudMessage && <Alert severity="success">{cloudMessage}</Alert>}
        {cloudError && <Alert severity="error">{cloudError}</Alert>}
      </Stack></CardContent></Card>

      <Card className="no-print"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>バックアップ／復元</Typography>
        <Typography color="text.secondary">端末内データの保存と復元を、ここから分かりやすく操作できます。</Typography>
        <Button variant="contained" onClick={handleBackup} disabled={backupSaving} sx={{ alignSelf: 'flex-start' }}>{backupSaving ? 'バックアップを作成中…' : 'バックアップを保存'}</Button>
        {backupMessage && <Alert severity="success">{backupMessage}</Alert>}
        {backupError && <Alert severity="error">{backupError}</Alert>}
        <Button component={RouterLink} to="/backups" variant="outlined" size="large" fullWidth sx={{ minHeight: 52, fontWeight: 800 }}>バックアップ／復元を開く</Button>
      </Stack></CardContent></Card>
      {saved && <Alert severity="success">農場設定を保存しました。</Alert>}

      <Card className="no-print"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>農場情報</Typography>
        <TextField label="農場名" value={form.farmName} onChange={(e) => setValue('farmName', e.target.value)} fullWidth />
        <TextField label="代表者名" value={form.ownerName} onChange={(e) => setValue('ownerName', e.target.value)} fullWidth />
        <TextField label="担当者名" value={form.staffName} onChange={(e) => setValue('staffName', e.target.value)} fullWidth />
        <TextField label="電話番号" value={form.phone} onChange={(e) => setValue('phone', e.target.value)} fullWidth />
        <TextField label="住所" value={form.address} onChange={(e) => setValue('address', e.target.value)} fullWidth />
        <TextField label="発情周期（日）" type="number" value={form.estrousCycleDays} onChange={(e) => setValue('estrousCycleDays', Number(e.target.value))} fullWidth />
        <Divider />
        <Card variant="outlined" sx={{ bgcolor: 'info.50', borderColor: 'info.main' }}><CardContent><Stack spacing={1.25}>
          <Stack spacing={0.5}>
            <Typography variant="h6" fontWeight={900}>マスター登録のご案内</Typography>
            <Typography color="text.secondary">種雄牛・飼料・薬品・取引先・獣医師・授精師・経費科目・疾病・処置内容は、「マスター登録」画面からまとめて登録できます。</Typography>
            <Typography color="text.secondary">登録場所が1か所になり、入力画面でも同じ候補を使えます。</Typography>
          </Stack>
          <Button component={RouterLink} to="/masters" variant="contained" size="large" fullWidth sx={{ minHeight: 52, fontWeight: 800 }}>マスター登録を開く</Button>
          <Alert severity="info">旧候補データ（種雄牛候補・購入先候補）は互換性のため保持されますが、この画面では編集しません。</Alert>
          <Card variant="outlined"><CardContent><Stack spacing={1.25}>
            <Typography fontWeight={800}>旧候補をマスターへ取り込む</Typography>
            <Typography color="text.secondary">旧設定の「種雄牛候補」「購入先候補」を、共通マスターへ一括で取り込みます。</Typography>
            <Button variant="contained" size="large" onClick={handleImportLegacyMasters} disabled={importing} fullWidth sx={{ minHeight: 52, fontWeight: 800 }}>{importing ? '取り込み中...' : '旧候補をマスターへ取り込む'}</Button>
            {importError && <Alert severity="error">{importError}</Alert>}
            {importResult && importResult.targetCount === 0 && <Alert severity="info">取り込み対象の旧候補はありません。</Alert>}
            {importResult && importResult.targetCount > 0 && <Alert severity="success">取り込み結果: 新規登録 {importResult.createdCount} 件 / 重複スキップ {importResult.skippedCount} 件 / 対象 {importResult.targetCount} 件</Alert>}
          </Stack></CardContent></Card>
        </Stack></CardContent></Card>
        <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} multiline minRows={3} fullWidth />
        <Button variant="contained" size="large" onClick={handleSave}>設定を保存</Button>
      </Stack></CardContent></Card>

      <Card className="print-card"><CardContent><Stack spacing={2}>
        <Typography variant="h6" fontWeight={800}>現在の農場情報</Typography>
        <Typography color="text.secondary">印刷時にも確認できる設定内容です。</Typography>
        <Divider />
        <Table size="small"><TableBody>
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