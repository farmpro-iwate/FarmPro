import { ChangeEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { downloadBackup, importBackupJson } from '../services/backupApi';

type BackupJson = {
  app?: string;
  version?: string;
  exportedAt?: string;
  data?: Record<string, unknown>;
};

type PreviewCounts = {
  cattle: number;
  calves: number;
  breedings: number;
  vaccines: number;
  blvTests: number;
  schedules: number;
  treatments: number;
  sales: number;
  expenses: number;
  feedings: number;
  feedInventory: number;
  feedingGuide: number;
  feedingAlertActions: number;
  settings: number;
};

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function createPreviewCounts(json: BackupJson): PreviewCounts {
  const data = json.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('INVALID_BACKUP');
  }

  const requiredKeys = [
    'cattle',
    'calves',
    'breedings',
    'vaccines',
    'blvTests',
    'schedules',
    'treatments'
  ];

  if (requiredKeys.some((key) => !Array.isArray(data[key]))) {
    throw new Error('INVALID_BACKUP_DATA');
  }

  const settings = data.settings;

  return {
    cattle: arrayCount(data.cattle),
    calves: arrayCount(data.calves),
    breedings: arrayCount(data.breedings),
    vaccines: arrayCount(data.vaccines),
    blvTests: arrayCount(data.blvTests),
    schedules: arrayCount(data.schedules),
    treatments: arrayCount(data.treatments),
    sales: arrayCount(data.sales),
    expenses: arrayCount(data.expenses),
    feedings: arrayCount(data.feedings),
    feedInventory: arrayCount(data.feedInventory),
    feedingGuide: arrayCount(data.feedingGuide),
    feedingAlertActions: arrayCount(data.feedingAlertActions),
    settings: settings && typeof settings === 'object' && !Array.isArray(settings) && Object.keys(settings).length > 0 ? 1 : 0
  };
}

export function BackupPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<BackupJson | null>(null);
  const [previewCounts, setPreviewCounts] = useState<PreviewCounts | null>(null);
  const [restoring, setRestoring] = useState(false);

  const clearSelection = () => {
    setSelectedFileName('');
    setSelectedBackup(null);
    setPreviewCounts(null);
  };

  const handleDownload = () => {
    setMessage('');
    setError('');
    downloadBackup();
    setMessage('全データのバックアップJSONのダウンロードを開始しました。');
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setMessage('');
    setError('');
    clearSelection();

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text) as BackupJson;
      const counts = createPreviewCounts(json);
      setSelectedFileName(file.name);
      setSelectedBackup(json);
      setPreviewCounts(counts);
      setMessage('バックアップ内容を読み込みました。件数を確認してから復元してください。');
    } catch {
      setError('バックアップJSONを読み込めませんでした。正しいFarmProのバックアップファイルを選んでください。');
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup || !previewCounts || restoring) return;

    const confirmed = window.confirm(
      '表示中の件数で現在のJSONデータを上書きします。元に戻せないため、今のデータをバックアップしてから実行してください。復元してもよろしいですか？'
    );
    if (!confirmed) return;

    setMessage('');
    setError('');
    setRestoring(true);

    try {
      const result = await importBackupJson(selectedBackup);
      setMessage(
        `復元しました。牛台帳${result.counts.cattle}件、子牛${result.counts.calves}件、繁殖${result.counts.breedings}件、ワクチン${result.counts.vaccines}件、BLV${result.counts.blvTests}件、予定${result.counts.schedules}件、治療${result.counts.treatments}件、販売${result.counts.sales ?? 0}件、経費${result.counts.expenses ?? 0}件、飼料給与${result.counts.feedings ?? 0}件、在庫${result.counts.feedInventory ?? 0}件、給与目安${result.counts.feedingGuide ?? 0}件、対応記録${result.counts.feedingAlertActions ?? 0}件。`
      );
      clearSelection();
    } catch {
      setError('復元に失敗しました。バックアップJSONファイルを確認してください。');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>バックアップ</Typography>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>全データをバックアップ</Typography>
            <Typography color="text.secondary">
              牛台帳、子牛、繁殖、ワクチン、BLV、予定、治療に加えて、出荷・販売、経費、飼料給与、飼料在庫、給与目安、給与アラート対応記録、農場設定・マスターをまとめて保存します。
            </Typography>
            <Alert severity="info">
              機種変更や故障に備え、定期的にバックアップJSONを保存してください。
            </Alert>
            <Button variant="contained" size="large" onClick={handleDownload}>
              全データのバックアップJSONをダウンロード
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>バックアップから復元</Typography>
            <Alert severity="warning">
              復元すると、現在のJSONデータはバックアップファイルの内容で上書きされます。実行前に今のデータもバックアップしてください。
            </Alert>
            <Typography color="text.secondary">
              以前の形式で保存したバックアップJSONも復元できます。旧形式に含まれていない追加データは空の状態になります。
            </Typography>
            <Button variant="outlined" component="label" size="large">
              バックアップJSONを選択して内容を確認
              <input type="file" accept="application/json,.json" hidden onChange={handleFile} />
            </Button>

            {previewCounts && selectedBackup && (
              <Stack spacing={2}>
                <Divider />
                <Typography variant="h6" fontWeight={800}>復元前の内容確認</Typography>
                <Typography fontWeight={700}>選択ファイル：{selectedFileName}</Typography>
                <Typography color="text.secondary">
                  保存日時：{selectedBackup.exportedAt ? new Date(selectedBackup.exportedAt).toLocaleString('ja-JP') : '記録なし'}
                </Typography>
                <Alert severity="info">
                  牛台帳 {previewCounts.cattle}件 ／ 子牛 {previewCounts.calves}件 ／ 繁殖 {previewCounts.breedings}件 ／ ワクチン {previewCounts.vaccines}件 ／ BLV {previewCounts.blvTests}件 ／ 予定 {previewCounts.schedules}件 ／ 治療 {previewCounts.treatments}件
                </Alert>
                <Alert severity="info">
                  販売 {previewCounts.sales}件 ／ 経費 {previewCounts.expenses}件 ／ 飼料給与 {previewCounts.feedings}件 ／ 在庫 {previewCounts.feedInventory}件 ／ 給与目安 {previewCounts.feedingGuide}件 ／ 対応記録 {previewCounts.feedingAlertActions}件 ／ 農場設定 {previewCounts.settings > 0 ? 'あり' : 'なし'}
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="contained" color="warning" size="large" onClick={handleRestore} disabled={restoring}>
                    {restoring ? '復元しています…' : 'この内容で復元する'}
                  </Button>
                  <Button variant="outlined" size="large" onClick={clearSelection} disabled={restoring}>
                    選択を取り消す
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
