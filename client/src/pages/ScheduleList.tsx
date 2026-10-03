import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Schedule } from '../types/schedule';
import { deleteSchedule, getScheduleList } from '../services/scheduleApi';
import { getCattleList } from '../services/api';
import { getCattlePlanSnapshot } from '../services/cattlePlanSnapshot';
import { cattlePlanDestination, localCattlePlanToday, resolveCattleBreedingPlans, type CattlePlanSummary } from '../utils/cattleBreedingPlans';
import { breedingPlanDaysUntil } from '../utils/breedingPlans';
import { daysUntil, judgeSchedule } from '../utils/schedule';
import { matchesAnyText, matchesSelect } from '../utils/search';

function mapScheduleTitleToBreedingTreatmentType(title: string): string {
  if (title.includes('排卵')) return '排卵誘起処置';
  if (title.includes('発情')) return '発情誘起処置';
  if (title.includes('同期')) return '発情・排卵同期化';
  if (title.includes('黄体')) return '黄体関連処置';
  return 'その他の繁殖処置';
}

function buildExecuteUrl(item: Schedule): string {
  const commonParams = new URLSearchParams({
    targetNumber: item.targetNumber,
    targetName: item.targetName,
    actionDate: item.dueDate,
    sourceScheduleId: String(item.id),
    programId: item.synchronizationProgramId || '',
    programName: item.synchronizationProgramName || '',
    returnTo: '/schedules',
  });

  if (item.title.includes('人工授精') || item.title.includes('種付')) {
    return `/breedings/synchronization/insemination?${commonParams.toString()}`;
  }

  if (item.title.includes('受精卵移植') || item.title.toUpperCase().includes('ET')) {
    return `/breedings/synchronization/transfer?${commonParams.toString()}`;
  }

  const treatmentParams = new URLSearchParams({
    targetNumber: item.targetNumber,
    targetName: item.targetName,
    recordType: '繁殖治療',
    breedingTreatmentType: mapScheduleTitleToBreedingTreatmentType(item.title),
    treatmentDate: item.dueDate,
    symptom: item.title,
    sourceScheduleId: String(item.id),
    returnTo: '/schedules',
  });
  return `/treatments/new?${treatmentParams.toString()}`;
}

export function ScheduleList() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [breedingPlans, setBreedingPlans] = useState<Array<{ animal: Record<string, any>; summary: CattlePlanSummary }>>([]);
  const [breedingPlanIssues, setBreedingPlanIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [scheduleType, setScheduleType] = useState('すべて');
  const [status, setStatus] = useState('すべて');
  const [searchOpen, setSearchOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [scheduleItems, cattle, snapshot] = await Promise.all([
      getScheduleList(),
      getCattleList().catch(() => []),
      getCattlePlanSnapshot(),
    ]);
    setItems(scheduleItems);

    const today = localCattlePlanToday();
    const automaticPlans: Array<{ animal: Record<string, any>; summary: CattlePlanSummary }> = [];
    const issues: string[] = [];
    (cattle as Array<Record<string, any>>).forEach((animal) => {
      const summary = resolveCattleBreedingPlans(animal, snapshot, today);
      if (summary.isSold) return;
      if (summary.plans.length > 0) automaticPlans.push({ animal, summary });
      summary.issues.forEach((message) => {
        const target = [animal.earTag ? `耳標 ${animal.earTag}` : '', animal.name || ''].filter(Boolean).join('　');
        const text = target ? `${target}：${message}` : message;
        if (!issues.includes(text)) issues.push(text);
      });
    });
    setBreedingPlans(automaticPlans);
    setBreedingPlanIssues(issues);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => (
    items.filter((item) =>
      matchesAnyText([item.title, item.targetName, item.targetNumber, item.note], keyword) &&
      matchesSelect(item.scheduleType, scheduleType) &&
      matchesSelect(item.status, status),
    )
  ), [items, keyword, scheduleType, status]);

  const handleDelete = async (item: Schedule) => {
    if (!window.confirm(`${item.title} を削除しますか？`)) return;
    await deleteSchedule(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setScheduleType('すべて');
    setStatus('すべて');
  };

  const statusColor = (label: string) => {
    if (label === '完了') return 'primary';
    if (label === '期限超過') return 'error';
    if (label === '今日' || label === 'まもなく') return 'warning';
    return 'default';
  };

  const hasFilters = Boolean(keyword || scheduleType !== 'すべて' || status !== 'すべて');

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>予定管理</Typography>
          <Typography color="text.secondary">妊娠鑑定、ワクチン、治療、出荷など、これから行う作業を登録・確認します。</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button component={RouterLink} to="/schedules/new" variant="contained" startIcon={<AddIcon />}>新規登録</Button>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.25}>
            <Stack spacing={0.25}>
              <Typography variant="h6" fontWeight={800}>繁殖から自動表示される予定</Typography>
              <Typography color="text.secondary" variant="body2">
                繁殖記録から算出した参照用の予定です。ここから削除・完了にはせず、元の記録や登録画面で対応します。
              </Typography>
            </Stack>
            {breedingPlanIssues.map((message) => <Alert key={message} severity="warning">{message}</Alert>)}
            {!loading && breedingPlans.length === 0 && breedingPlanIssues.length === 0 && (
              <Typography color="text.secondary">表示できる繁殖予定はありません。</Typography>
            )}
            {breedingPlans.map(({ animal, summary }) => (
              <Stack key={String(animal.id)} spacing={0.75}>
                {summary.plans.map((plan) => {
                  const destination = cattlePlanDestination(plan, animal, '/schedules');
                  const remaining = plan.date ? breedingPlanDaysUntil(plan.date, localCattlePlanToday()) : null;
                  const timing = plan.date
                    ? remaining === 0 ? '今日'
                      : remaining !== null && remaining < 0 ? '期限超過'
                      : remaining !== null ? `あと${remaining}日`
                      : ''
                    : '継続中';
                  return (
                    <Card key={`${animal.id}-${plan.sourceRecordId || ''}-${plan.kind}`} variant="outlined">
                      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                          <Chip size="small" label={timing} color={timing === '期限超過' ? 'error' : timing === '今日' ? 'warning' : 'info'} />
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography fontWeight={800}>{plan.title}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              耳標 {animal.earTag || '-'}　{animal.name || '-'}{plan.date ? `　予定日：${plan.date}` : ''}
                            </Typography>
                            {plan.kind === 'feed-review' && plan.relatedDate && (
                              <Typography variant="body2" color="text.secondary">分娩予定日：{plan.relatedDate}</Typography>
                            )}
                            {plan.note && <Typography variant="body2" color="text.secondary">{plan.note}</Typography>}
                          </Box>
                          <Button component={RouterLink} to={destination.to} size="small" variant="outlined">
                            {destination.label}
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {searchOpen && (
        <Card>
          <CardContent sx={{ py: 1.5 }}>
            <Stack spacing={1}>
              <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label="検索" placeholder="予定内容・対象名・対象番号" value={keyword} onChange={(e) => setKeyword(e.target.value)} fullWidth size="small" />
                <TextField label="予定区分" select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)} size="small" sx={{ minWidth: { sm: 140 }, width: { xs: '100%', sm: 'auto' } }}>
                  <MenuItem value="すべて">すべて</MenuItem><MenuItem value="分娩">分娩</MenuItem><MenuItem value="ワクチン">ワクチン</MenuItem><MenuItem value="BLV検査">BLV検査</MenuItem><MenuItem value="妊娠鑑定">妊娠鑑定</MenuItem><MenuItem value="治療">治療</MenuItem><MenuItem value="その他">その他</MenuItem>
                </TextField>
                <TextField label="状態" select value={status} onChange={(e) => setStatus(e.target.value)} size="small" sx={{ minWidth: { sm: 120 }, width: { xs: '100%', sm: 'auto' } }}>
                  <MenuItem value="すべて">すべて</MenuItem><MenuItem value="未完了">未完了</MenuItem><MenuItem value="完了">完了</MenuItem>
                </TextField>
                <Button variant="outlined" onClick={clearSearch} size="small" sx={{ width: { xs: '100%', sm: 'auto' } }}>クリア</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {loading ? <Typography>読み込み中...</Typography> : (
            <>
              <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                {filteredItems.map((item) => {
                  const label = judgeSchedule(item.status, item.dueDate);
                  const canExecute = Boolean(item.synchronizationProgramId && item.status !== '完了');
                  return (
                    <Card key={item.id} variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                            <Box><Typography fontWeight={800}>{item.title}</Typography><Typography color="text.secondary" variant="body2">{item.scheduleType}</Typography></Box>
                            <Chip size="small" label={label} color={statusColor(label) as any} />
                          </Stack>
                          <Typography><b>対象：</b>{item.targetName || '-'}{item.targetNumber ? ` (${item.targetNumber})` : ''}</Typography>
                          <Typography><b>予定日：</b>{item.dueDate}</Typography>
                          <Typography color="text.secondary">{item.status === '完了' ? '完了済み' : `あと${daysUntil(item.dueDate)}日`}</Typography>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            {canExecute && (
                              <Button component={RouterLink} to={buildExecuteUrl(item)} variant="contained" startIcon={<PlayArrowIcon />} fullWidth>実施</Button>
                            )}
                            <Button component={RouterLink} to={`/schedules/${item.id}/edit`} variant="outlined" startIcon={<EditIcon />} fullWidth>編集</Button>
                            <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => handleDelete(item)} fullWidth>削除</Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>

              <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>予定区分</TableCell><TableCell>予定内容</TableCell><TableCell>対象</TableCell><TableCell>予定日</TableCell><TableCell>判定</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const label = judgeSchedule(item.status, item.dueDate);
                      const canExecute = Boolean(item.synchronizationProgramId && item.status !== '完了');
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.scheduleType}</TableCell>
                          <TableCell>{item.title}</TableCell>
                          <TableCell>{item.targetName || '-'}{item.targetNumber && <><br /><Typography variant="caption" color="text.secondary">{item.targetNumber}</Typography></>}</TableCell>
                          <TableCell>{item.dueDate}<br /><Typography variant="caption" color="text.secondary">{item.status === '完了' ? '完了済み' : `あと${daysUntil(item.dueDate)}日`}</Typography></TableCell>
                          <TableCell><Chip size="small" label={label} color={statusColor(label) as any} /></TableCell>
                          <TableCell align="right">
                            {canExecute && <IconButton component={RouterLink} to={buildExecuteUrl(item)} color="primary"><PlayArrowIcon /></IconButton>}
                            <IconButton component={RouterLink} to={`/schedules/${item.id}/edit`}><EditIcon /></IconButton>
                            <IconButton color="error" onClick={() => handleDelete(item)}><DeleteIcon /></IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
