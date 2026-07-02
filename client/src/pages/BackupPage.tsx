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
    setMessage('バックアップJSONのダウンロードを開始しました。');
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
        `復元しました。牛台帳${result.counts.cattle}件、子牛${result.counts.calves}件、繁殖${result.counts.breedings}件、ワクチン${result.counts.vaccines}件、BLV${result.counts.blvTests}件、予定${result.counts.schedules}件、治療${result.counts.treatments}件。`
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
              牛台帳、子牛、繁殖、ワクチン、BLV、予定、治療のJSONデータをまとめて保存します。
            </Typography>
            <Button variant="contained" size="large" onClick={handleDownload}>
              バックアップJSONをダウンロード
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
