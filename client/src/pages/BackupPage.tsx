import { ChangeEvent, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import {
  createFarmProBackup,
  downloadFarmProBackup,
  type FarmProBackup,
} from '../storage/backup';
import { readFarmProBackupFile } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import type { StoreName } from '../storage/types';

type PreviewCounts = Record<StoreName, number>;

const STORE_LABELS: Partial<Record<StoreName, string>> = {
  settings: '設定',
  masters: 'マスター',
  cattle: '牛台帳',
  calves: '子牛',
  breedings: '繁殖',
  calvings: '分娩',
  treatments: '治療',
  vaccines: 'ワクチン',
  schedules: '予定',
  feedings: '飼料給与',
  feedingGuide: '給与目安',
  feedingAlertActions: '対応記録',
  feedInventory: '飼料在庫',
  sales: '販売',
  expenses: '経費',
  photos: '写真',
  metadata: '農場設定・アプリ情報',
};

function createPreviewCounts(backup: FarmProBackup): PreviewCounts {
  return Object.fromEntries(
    FARM_PRO_STORE_NAMES.map((storeName) => [
      storeName,
      Array.isArray(backup.stores[storeName]) ? backup.stores[storeName].length : 0,
    ]),
  ) as PreviewCounts;
}

function formatDate(value?: string) {
  if (!value) return '記録なし';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

export function BackupPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedBackup, setSelectedBackup] = useState<FarmProBackup | null>(null);
  const [previewCounts, setPreviewCounts] = useState<PreviewCounts | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const totalRecords = useMemo(() => {
    if (!previewCounts) return 0;
    return Object.values(previewCounts).reduce((sum, count) => sum + count, 0);
  }, [previewCounts]);

  const clearSelection = () => {
    setSelectedFileName('');
    setSelectedBackup(null);
    setPreviewCounts(null);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setMessage('');
    setError('');
    setDownloading(true);

    try {
      const backup = await createFarmProBackup(__APP_VERSION__);
      downloadFarmProBackup(backup);
      setMessage('手動バックアップを作成しました。JSONファイルは大切に保管してください。');
    } catch (downloadError) {
      console.error(downloadError);
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'バックアップを保存できませんでした。',
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setMessage('');
    setError('');
    clearSelection();

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const backup = await readFarmProBackupFile(file);
      setSelectedFileName(file.name);
      setSelectedBackup(backup);
      setPreviewCounts(createPreviewCounts(backup));
      setMessage('バックアップ内容を読み込みました。農場名・保存日時・件数を確認してください。');
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : 'バックアップJSONを読み込めませんでした。',
      );
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup || !previewCounts || restoring) return;

    const farmLabel = selectedBackup.farm?.name
      ? `農場「${selectedBackup.farm.name}」`
      : '農場名が記録されていないバックアップ';

    const confirmed = window.confirm(
      `${farmLabel}の内容で、現在のFarmProデータをすべて入れ替えます。\n\n現在のデータは元に戻せないため、先に手動バックアップを作成してください。\n\n復元を実行しますか？`,
    );
    if (!confirmed) return;

    setMessage('');
    setError('');
    setRestoring(true);

    try {
      await restoreFarmProBackup(selectedBackup);
      setMessage('バックアップから復元しました。画面を再読み込みします。');
      clearSelection();
      window.setTimeout(() => window.location.reload(), 700);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : 'バックアップの復元に失敗しました。',
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>バックアップ／復元</Typography>

      <Alert severity="info">
        ここでは手動バックアップファイルの作成と復元ができます。Standard / Proのクラウド自動バックアップとは別の予備機能です。
      </Alert>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>1. 手動バックアップを作成</Typography>
            <Typography color="text.secondary">
              牛台帳、子牛、繁殖、分娩、治療、ワクチン、販売、経費、飼料管理、農場設定、マスターなどを1つのJSONファイルにまとめます。
            </Typography>
            <Button variant="contained" size="large" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'バックアップを作成中…' : 'バックアップファイルを作成'}
            </Button>
            <Alert severity="warning">
              作成したファイルは、メール・クラウド・パソコンなど安全な場所にもコピーして保管してください。
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>2. バックアップから復元</Typography>
            <Alert severity="warning">
              復元すると、現在のFarmProデータはバックアップの内容に入れ替わります。実行前に手動バックアップを作成してください。
            </Alert>
            <Button variant="outlined" component="label" size="large" disabled={restoring}>
              バックアップJSONを選択
              <input type="file" accept="application/json,.json" hidden onChange={handleFile} />
            </Button>

            {previewCounts && selectedBackup && (
              <Stack spacing={2}>
                <Divider />
                <Typography variant="h6" fontWeight={800}>復元前の内容確認</Typography>
                <Typography fontWeight={700}>選択ファイル：{selectedFileName}</Typography>
                <Typography color="text.secondary">保存日時：{formatDate(selectedBackup.exportedAt)}</Typography>
                <Typography color="text.secondary">アプリ版：{selectedBackup.appVersion}</Typography>

                {selectedBackup.farm ? (
                  <Alert severity="info">
                    農場：{selectedBackup.farm.name || '名称なし'} ／ 農場ID：{selectedBackup.farm.id}
                  </Alert>
                ) : (
                  <Alert severity="warning">
                    このバックアップには農場名が記録されていません。内容と件数を十分確認してください。
                  </Alert>
                )}

                <Alert severity="info">保存されているレコード総数：{totalRecords}件</Alert>

                <Stack spacing={0.5}>
                  {FARM_PRO_STORE_NAMES.map((storeName) => (
                    <Typography key={storeName} color="text.secondary">
                      {STORE_LABELS[storeName] || storeName}：{previewCounts[storeName]}件
                    </Typography>
                  ))}
                </Stack>

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

export default BackupPage;
