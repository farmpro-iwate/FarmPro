import { ChangeEvent, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { downloadBackup, importBackupJson } from '../services/backupApi';

export function BackupPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleDownload = () => {
    setMessage('');
    setError('');
    downloadBackup();
    setMessage('全データのバックアップJSONのダウンロードを開始しました。');
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setMessage('');
    setError('');

    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm('現在のJSONデータをバックアップファイルの内容で上書きします。実行してもよろしいですか？')) {
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const result = await importBackupJson(json);
      setMessage(
        `復元しました。牛台帳${result.counts.cattle}件、子牛${result.counts.calves}件、繁殖${result.counts.breedings}件、ワクチン${result.counts.vaccines}件、BLV${result.counts.blvTests}件、予定${result.counts.schedules}件、治療${result.counts.treatments}件、販売${result.counts.sales ?? 0}件、経費${result.counts.expenses ?? 0}件、飼料給与${result.counts.feedings ?? 0}件、在庫${result.counts.feedInventory ?? 0}件、給与目安${result.counts.feedingGuide ?? 0}件、対応記録${result.counts.feedingAlertActions ?? 0}件。`
      );
    } catch {
      setError('復元に失敗しました。バックアップJSONファイルを確認してください。');
    } finally {
      event.target.value = '';
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
              バックアップJSONを選択して復元
              <input type="file" accept="application/json,.json" hidden onChange={handleFile} />
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
