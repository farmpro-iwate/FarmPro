import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Divider, Stack, Table, TableBody, TableCell, TableRow, TextField, Typography } from '@mui/material';
import { FarmSettings } from '../types/settings';
import { getFarmSettings, updateFarmSettings } from '../services/settingsApi';
import { createMaster, getMasterList } from '../services/masterApi';

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
  const [saved, setSaved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
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
        if (activeSireNames.has(name)) {
          skippedCount += 1;
          continue;
        }
        await createMaster({ category: 'sire', name });
        activeSireNames.add(name);
        createdCount += 1;
      }

      for (const name of legacyPartners) {
        if (activePartnerNames.has(name)) {
          skippedCount += 1;
          continue;
        }
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

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} className="no-print">
        <Typography variant="h5" fontWeight={800}>農場設定</Typography>
        <Button variant="contained" onClick={() => window.print()} sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, whiteSpace: 'nowrap' }}>印刷する</Button>
      </Stack>
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

            <Divider />
            <Card
              variant="outlined"
              sx={{
                bgcolor: 'info.50',
                borderColor: 'info.main'
              }}
            >
              <CardContent>
                <Stack spacing={1.25}>
                  <Stack spacing={0.5}>
                    <Typography variant="h6" fontWeight={900}>マスター登録のご案内</Typography>
                    <Typography color="text.secondary">
                      種雄牛・飼料・薬品・取引先・獣医師・授精師・経費科目は、
                      「マスター登録」画面からまとめて登録できます。
                    </Typography>
                    <Typography color="text.secondary">
                      登録場所が1か所になり、入力画面でも同じ候補を使えます。
                    </Typography>
                  </Stack>
                  <Button
                    component={RouterLink}
                    to="/masters"
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{ minHeight: 52, fontWeight: 800 }}
                  >
                    マスター登録を開く
                  </Button>
                  <Alert severity="info">
                    旧候補データ（種雄牛候補・購入先候補）は互換性のため保持されますが、この画面では編集しません。
                  </Alert>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack spacing={1.25}>
                        <Typography fontWeight={800}>旧候補をマスターへ取り込む</Typography>
                        <Typography color="text.secondary">
                          旧設定の「種雄牛候補」「購入先候補」を、共通マスターへ一括で取り込みます。
                        </Typography>
                        <Button
                          variant="contained"
                          size="large"
                          onClick={handleImportLegacyMasters}
                          disabled={importing}
                          fullWidth
                          sx={{ minHeight: 52, fontWeight: 800 }}
                        >
                          {importing ? '取り込み中...' : '旧候補をマスターへ取り込む'}
                        </Button>

                        {importError && <Alert severity="error">{importError}</Alert>}

                        {importResult && importResult.targetCount === 0 && (
                          <Alert severity="info">取り込み対象の旧候補はありません。</Alert>
                        )}

                        {importResult && importResult.targetCount > 0 && (
                          <Alert severity="success">
                            取り込み結果: 新規登録 {importResult.createdCount} 件 / 重複スキップ {importResult.skippedCount} 件 / 対象 {importResult.targetCount} 件
                          </Alert>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </CardContent>
            </Card>

            <Stack spacing={0.5}>
              <Typography variant="h6" fontWeight={800}>マスター登録</Typography>
              <Typography color="text.secondary">詳細な登録・編集・有効化/無効化は「マスター登録」画面で行います。</Typography>
            </Stack>
            <Button component={RouterLink} to="/masters" variant="outlined" fullWidth sx={{ minHeight: 44, fontWeight: 700 }}>
              詳細なマスター管理へ
            </Button>

            <TextField label="メモ" value={form.memo} onChange={(e) => setValue('memo', e.target.value)} multiline minRows={3} fullWidth />
            <Button variant="contained" size="large" onClick={handleSave}>設定を保存</Button>
          </Stack>
        </CardContent>
      </Card>

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
