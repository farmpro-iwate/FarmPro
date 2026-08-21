import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { createCattle, getCattleList } from '../services/api';

export function DevSeedPage() {
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    const cattle = await getCattleList();
    setCount(cattle.filter((item) => item.sex === '雌' && item.stage !== '育成牛').length);
  };

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : '頭数を確認できませんでした。'));
  }, []);

  const seedToTen = async () => {
    setRunning(true);
    setMessage('');
    setError('');

    try {
      const cattle = await getCattleList();
      const currentCount = cattle.filter((item) => item.sex === '雌' && item.stage !== '育成牛').length;
      const missing = Math.max(0, 10 - currentCount);

      if (missing === 0) {
        setMessage(`繁殖雌牛はすでに${currentCount}頭います。追加していません。`);
        setCount(currentCount);
        return;
      }

      const usedEarTags = new Set(cattle.map((item) => item.earTag));
      let serial = 1;
      let created = 0;

      while (created < missing) {
        const earTag = `TEST-${String(serial).padStart(3, '0')}`;
        serial += 1;
        if (usedEarTags.has(earTag)) continue;

        await createCattle({
          earTag,
          identificationNumber: '',
          name: `テスト繁殖雌牛${currentCount + created + 1}`,
          birthday: '2024-01-01',
          sex: '雌',
          sire: '',
          dam: '',
          parity: 0,
          blvStatus: '未検査',
          stage: '繁殖牛',
          note: '料金プラン頭数制限の開発テスト用',
        });
        usedEarTags.add(earTag);
        created += 1;
      }

      await refresh();
      setMessage(`${created}頭追加しました。繁殖雌牛は10頭になりました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テストデータの追加に失敗しました。');
    } finally {
      setRunning(false);
    }
  };

  if (!import.meta.env.DEV) {
    return <Alert severity="error">この画面は開発環境でのみ利用できます。</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>開発用：頭数制限テスト</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography>
              FarmPro本体と同じIndexedDB・同じ登録処理を使います。既存データは削除せず、繁殖雌牛が10頭になるまで不足分だけ追加します。
            </Typography>
            <Typography fontWeight={800}>
              現在の繁殖雌牛：{count === null ? '確認中…' : `${count}頭`}
            </Typography>
            <Button variant="contained" size="large" onClick={seedToTen} disabled={running}>
              {running ? '追加中…' : '繁殖雌牛を10頭にする'}
            </Button>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
