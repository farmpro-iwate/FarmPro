import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { Calf } from '../types/calf';
import { getAllRecords, getRecordById } from '../storage/repository';
import type { StoredRecord } from '../storage/types';

type FeedingAlertAction = StoredRecord & {
  id: string;
  actionDate?: string;
  calfId?: string | number;
  calfName?: string;
  ageDays?: string | number;
  alertType?: string;
  actionType?: string;
  status?: string;
  nextCheckDate?: string;
  memo?: string;
};

type FeedingGuide = StoredRecord & {
  id: string | number;
  ageDays?: string | number;
  stageName?: string;
  starterKg?: string | number;
  growingFeedKg?: string | number;
  roughageKg?: string | number;
  memo?: string;
};

function value(v: unknown) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v);
}

function ageDaysFromBirthday(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function calfNameOf(calf: Calf | null) {
  if (!calf) return '';
  return String(calf.name || calf.calfNumber || '');
}

function statusColor(status: string) {
  if (status.includes('済み')) return 'success';
  if (status.includes('対応中')) return 'warning';
  if (status.includes('様子見')) return 'info';
  if (status.includes('再確認')) return 'error';
  return 'default';
}

function alertColor(alertType: string) {
  if (alertType.includes('不足')) return 'warning';
  if (alertType.includes('多め')) return 'error';
  if (alertType.includes('実績なし')) return 'info';
  return 'default';
}

function nearestGuide(ageDays: number | null, guides: FeedingGuide[]) {
  if (ageDays === null || guides.length === 0) return null;

  return [...guides].sort((a, b) => {
    const da = Math.abs(Number(a.ageDays || 0) - ageDays);
    const db = Math.abs(Number(b.ageDays || 0) - ageDays);
    return da - db;
  })[0];
}

function newActionLink(calf: Calf | null, ageDays: number | null) {
  const params = new URLSearchParams();
  params.set('calfId', String(calf?.id || ''));
  params.set('calfName', calfNameOf(calf));
  params.set('ageDays', ageDays === null ? '' : String(ageDays));
  params.set('alertType', 'その他');
  params.set('memo', '子牛情報から登録');
  return `/feeding-alert-actions/new?${params.toString()}`;
}

export function CalfDetail() {
  const params = useParams();
  const calfId = String(params.id || '');

  const [calf, setCalf] = useState<Calf | null>(null);
  const [actions, setActions] = useState<FeedingAlertAction[]>([]);
  const [guides, setGuides] = useState<FeedingGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    try {
      const numericId = Number(calfId);
      const recordId = Number.isFinite(numericId) ? numericId : calfId;
      const [calfData, actionsData, guidesData] = await Promise.all([
        getRecordById<Calf>('calves', recordId),
        getAllRecords<FeedingAlertAction>('feedingAlertActions'),
        getAllRecords<FeedingGuide>('feedingGuide'),
      ]);

      if (!calfData) {
        throw new Error('子牛台帳に該当する子牛が見つかりませんでした。');
      }

      setCalf(calfData);
      setActions(actionsData);
      setGuides(guidesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '子牛情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [calfId]);

  const calfName = calfNameOf(calf);
  const ageDays = ageDaysFromBirthday(calf?.birthday);
  const guide = nearestGuide(ageDays, guides);

  const calfActions = useMemo(() => {
    return actions
      .filter((item) => {
        const itemCalfId = String(item.calfId || '');
        const itemCalfName = String(item.calfName || '');
        return (calfId && itemCalfId === calfId) || (calfName && itemCalfName === calfName);
      })
      .sort((a, b) => String(b.actionDate || '').localeCompare(String(a.actionDate || '')));
  }, [actions, calfId, calfName]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5" fontWeight={800} sx={{ flexGrow: 1 }}>子牛情報</Typography>
        <Button component={RouterLink} to="/calves" variant="outlined">子牛台帳へ戻る</Button>
        <Button component={RouterLink} to="/feeding-alert-actions" variant="outlined">対応記録一覧</Button>
      </Stack>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="warning">{error}</Alert>}

      {!loading && !error && (
        <>
          <Card><CardContent><Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>基本情報</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}><Typography color="text.secondary">子牛耳標番号</Typography><Typography fontWeight={800}>{value(calf?.calfNumber)}</Typography></Grid>
              <Grid item xs={12} md={3}><Typography color="text.secondary">名号</Typography><Typography fontWeight={800}>{value(calf?.name)}</Typography></Grid>
              <Grid item xs={12} md={3}><Typography color="text.secondary">生年月日</Typography><Typography fontWeight={800}>{value(calf?.birthday)}</Typography></Grid>
              <Grid item xs={12} md={3}><Typography color="text.secondary">日齢</Typography><Typography fontWeight={800}>{ageDays === null ? '-' : `${ageDays}日`}</Typography></Grid>
              <Grid item xs={12} md={3}><Typography color="text.secondary">性別</Typography><Typography fontWeight={800}>{value(calf?.sex)}</Typography></Grid>
              <Grid item xs={12} md={3}><Typography color="text.secondary">母牛</Typography><Typography fontWeight={800}>{value(calf?.motherName)}</Typography></Grid>
              <Grid item xs={12} md={6}><Typography color="text.secondary">備考</Typography><Typography fontWeight={800}>{value(calf?.note)}</Typography></Grid>
            </Grid>
          </Stack></CardContent></Card>

          <Card><CardContent><Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>給与目安</Typography>
            {ageDays === null ? <Alert severity="info">生年月日がないため、日齢から給与目安を表示できません。</Alert> : !guide ? <Alert severity="info">給与目安が登録されていません。</Alert> : (
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}><Typography color="text.secondary">近い日齢</Typography><Typography fontWeight={800}>{value(guide.ageDays)}日</Typography></Grid>
                <Grid item xs={12} md={3}><Typography color="text.secondary">ステージ</Typography><Typography fontWeight={800}>{value(guide.stageName)}</Typography></Grid>
                <Grid item xs={12} md={2}><Typography color="text.secondary">スターター</Typography><Typography fontWeight={800}>{value(guide.starterKg)}kg</Typography></Grid>
                <Grid item xs={12} md={2}><Typography color="text.secondary">育成配合</Typography><Typography fontWeight={800}>{value(guide.growingFeedKg)}kg</Typography></Grid>
                <Grid item xs={12} md={2}><Typography color="text.secondary">粗飼料</Typography><Typography fontWeight={800}>{value(guide.roughageKg)}kg</Typography></Grid>
              </Grid>
            )}
          </Stack></CardContent></Card>

          <Card><CardContent><Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800} sx={{ flexGrow: 1 }}>給与アラート対応履歴</Typography>
              <Button component={RouterLink} to={newActionLink(calf, ageDays)} variant="contained">対応記録を追加</Button>
            </Stack>
            <Alert severity="info">この子牛に対して登録された給与アラート対応記録を表示します。</Alert>
            {calfActions.length === 0 ? <Alert severity="success">この子牛の給与アラート対応記録はまだありません。</Alert> : (
              <Table size="small">
                <TableHead><TableRow><TableCell>対応日</TableCell><TableCell>アラート</TableCell><TableCell>対応内容</TableCell><TableCell>状態</TableCell><TableCell>次回確認日</TableCell><TableCell>メモ</TableCell><TableCell>操作</TableCell></TableRow></TableHead>
                <TableBody>{calfActions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{value(item.actionDate)}</TableCell>
                    <TableCell><Chip size="small" color={alertColor(String(item.alertType || '')) as any} label={value(item.alertType)} /></TableCell>
                    <TableCell>{value(item.actionType)}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(String(item.status || '')) as any} label={value(item.status)} /></TableCell>
                    <TableCell>{value(item.nextCheckDate)}</TableCell>
                    <TableCell>{value(item.memo)}</TableCell>
                    <TableCell><Button component={RouterLink} to={`/feeding-alert-actions/${item.id}/edit`} size="small" variant="outlined">編集</Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
            <Typography color="text.secondary">子牛IDまたは名号が一致する対応記録を表示しています。</Typography>
          </Stack></CardContent></Card>
        </>
      )}
    </Stack>
  );
}

export default CalfDetail;
