import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { Breeding } from '../types/breeding';
import { deleteBreeding, getBreedingList } from '../services/breedingApi';
import { daysUntil } from '../utils/breeding';
import { matchesAnyText, matchesSelect } from '../utils/search';

function resultColor(result: string) {
  if (result === '受胎') return 'success';
  if (result === '空胎' || result === '流産・胎子喪失') return 'error';
  if (result === '再鑑定予定') return 'info';
  return 'warning';
}

function displayDate(value: string) {
  return value || '未登録';
}

function performedDate(item: Breeding) {
  return item.breedingMethod === '受精卵移植' ? item.transferDate : item.inseminationDate;
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateDiffDays(from: Date, to: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.floor((toDay - fromDay) / dayMs);
}

function breedingActor(item: Breeding) {
  return item.breedingMethod === '受精卵移植'
    ? (item.transferTechnician || '未登録')
    : (item.inseminatorName || '未登録');
}

function breedingSire(item: Breeding) {
  return item.breedingMethod === '受精卵移植'
    ? (item.embryoSireName || '未登録')
    : (item.bullName || '未登録');
}

function currentStage(item: Breeding) {
  if (item.breedingStatus === '中止') return '経過観察';
  if (item.pregnancyResult === '受胎') {
    if (item.expectedCalvingDate) return '分娩待ち';
    return '受胎確認';
  }
  if (item.pregnancyResult === '再鑑定予定') return '経過観察';
  if (item.pregnancyResult === '空胎' || item.pregnancyResult === '流産・胎子喪失') return '経過観察';
  if (item.breedingStatus === '種付実施' || item.breedingStatus === '移植実施') return '妊娠鑑定待ち';
  if (item.breedingStatus === '発情確認') return '種付実施';
  if (item.breedingStatus === '完了') return '完了';
  return item.breedingStatus || '発情予定';
}

function nextAction(item: Breeding) {
  if (item.pregnancyResult === '再鑑定予定') {
    return { label: '再鑑定', date: item.recheckExpectedDate || '' };
  }
  if (!item.pregnancyCheckDate && item.pregnancyCheckExpectedDate) {
    return { label: '妊娠鑑定', date: item.pregnancyCheckExpectedDate };
  }
  if (item.pregnancyResult === '受胎' && item.expectedCalvingDate) {
    return { label: '分娩確認', date: item.expectedCalvingDate };
  }
  if (item.nextHeatExpectedDate) {
    return { label: '発情確認', date: item.nextHeatExpectedDate };
  }
  return { label: '記録確認', date: '' };
}

function cautionMessages(item: Breeding) {
  const messages: string[] = [];
  const today = new Date();

  const performed = parseDate(performedDate(item));
  if (!performed) messages.push('実施日が未登録です');

  const checkDate = parseDate(item.pregnancyCheckExpectedDate);
  if (checkDate && !item.pregnancyCheckDate && dateDiffDays(today, checkDate) < 0) {
    messages.push('妊娠鑑定予定日を過ぎています');
  }

  const recheckDate = parseDate(item.recheckExpectedDate);
  if (item.pregnancyResult === '再鑑定予定' && recheckDate && dateDiffDays(today, recheckDate) < 0) {
    messages.push('再鑑定予定日を過ぎています');
  }

  const calvingDate = parseDate(item.expectedCalvingDate);
  if (item.pregnancyResult === '受胎' && calvingDate) {
    const diff = dateDiffDays(today, calvingDate);
    if (diff >= 0 && diff <= 7) messages.push('分娩予定日が近づいています');
    if (diff < 0) messages.push('分娩予定日を過ぎています');
  }

  if (!item.nextHeatExpectedDate && !item.pregnancyCheckExpectedDate && !item.expectedCalvingDate) {
    messages.push('次回予定日が不足しています');
  }

  return messages;
}

function priorityRank(item: Breeding) {
  const today = new Date();
  const action = nextAction(item);
  const actionDate = parseDate(action.date);
  if (actionDate) {
    const diff = dateDiffDays(today, actionDate);
    if (diff < 0) return 0;
    if (diff <= 3) return 1;
  }
  if (currentStage(item) === '妊娠鑑定待ち') return 2;
  if (item.pregnancyResult === '受胎' && item.expectedCalvingDate) {
    const calving = parseDate(item.expectedCalvingDate);
    if (calving) {
      const diff = dateDiffDays(today, calving);
      if (diff <= 14) return 3;
    }
  }
  return 9;
}

function stageColor(stage: string) {
  if (stage === '妊娠鑑定待ち' || stage === '分娩待ち') return 'warning';
  if (stage === '受胎確認' || stage === '完了') return 'success';
  if (stage === '経過観察') return 'info';
  return 'default';
}

function BreedingMobileCard({ item, onDelete }: { item: Breeding; onDelete: (item: Breeding) => void }) {
  const stage = currentStage(item);
  const action = nextAction(item);
  const cautions = cautionMessages(item);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
            <Box>
              <Typography variant="h6" fontWeight={800}>耳標：{item.cowEarTag || '未登録'}</Typography>
              <Typography color="text.secondary">牛名：{item.cowName || '未登録'}</Typography>
            </Box>
            <Chip size="small" label={stage} color={stageColor(stage) as any} />
          </Stack>

          <Divider />

          <Stack spacing={0.75}>
            <Typography><strong>繁殖方法：</strong>{item.breedingMethod || '未選択'}</Typography>
            <Typography><strong>実際の発情日：</strong>{displayDate(item.heatDate)}</Typography>
            {item.breedingStatus === '中止' && item.transferCancelReason && (
              <Typography color="error"><strong>中止理由：</strong>{item.transferCancelReason}</Typography>
            )}
            <Typography><strong>種付・授精・移植日：</strong>{displayDate(performedDate(item))}</Typography>
            <Typography><strong>父牛：</strong>{breedingSire(item)}</Typography>
            <Typography><strong>担当者：</strong>{breedingActor(item)}</Typography>
            <Typography><strong>次に必要な対応：</strong>{action.label}</Typography>
            <Typography><strong>次回予定日：</strong>{displayDate(action.date)}</Typography>
            <Typography>
              <strong>分娩予定：</strong>{displayDate(item.expectedCalvingDate)}
              {item.expectedCalvingDate ? `（あと${daysUntil(item.expectedCalvingDate)}日）` : ''}
            </Typography>
            <Typography><strong>受胎確認：</strong>{item.pregnancyResult || '未鑑定'}</Typography>
          </Stack>

          {cautions.length > 0 && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {cautions[0]}
            </Alert>
          )}

          <Stack direction="row" spacing={1}>
            <Button
              component={RouterLink}
              to={`/breedings/${item.id}/edit`}
              variant="outlined"
              startIcon={<EditIcon />}
              fullWidth
            >
              編集
            </Button>
            <Button
              color="error"
              variant="outlined"
              startIcon={<DeleteIcon />}
              onClick={() => onDelete(item)}
              fullWidth
            >
              削除
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function BreedingList() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [items, setItems] = useState<Breeding[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState('すべて');
  const [stage, setStage] = useState('すべて');
  const [result, setResult] = useState('すべて');

  const load = async () => {
    setLoading(true);
    setItems(await getBreedingList());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) =>
      matchesAnyText([
        item.cowEarTag,
        item.cowName,
        item.breedingMethod,
        item.breedingStatus,
        item.pregnancyResult,
        breedingSire(item),
        breedingActor(item),
        item.note,
      ], keyword) &&
      matchesSelect(item.pregnancyResult, result) &&
      matchesSelect(item.breedingMethod, method) &&
      matchesSelect(currentStage(item), stage)
    );

    return filtered.sort((a, b) => {
      const rankDiff = priorityRank(a) - priorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      const aDate = parseDate(nextAction(a).date);
      const bDate = parseDate(nextAction(b).date);
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return performedDate(b).localeCompare(performedDate(a));
    });
  }, [items, keyword, result, method, stage]);

  const handleDelete = async (item: Breeding) => {
    if (!window.confirm(`${item.cowName}の繁殖記録を削除しますか？`)) return;
    await deleteBreeding(item.id);
    await load();
  };

  const clearSearch = () => {
    setKeyword('');
    setMethod('すべて');
    setStage('すべて');
    setResult('すべて');
  };

  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1}
      >
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>繁殖管理</Typography>
          <Typography color="text.secondary">表示：{filteredItems.length}件 / 全{items.length}件</Typography>
        </Stack>
        <Button component={RouterLink} to="/breedings/new" variant="contained" startIcon={<AddIcon />}>
          新規登録
        </Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? (
            <Typography>読み込み中...</Typography>
          ) : filteredItems.length === 0 ? (
            <Typography color="text.secondary">条件に合う繁殖記録はありません。</Typography>
          ) : isMobile ? (
            <Stack spacing={1.5}>
              {filteredItems.map((item) => (
                <BreedingMobileCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </Stack>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1120 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>耳標番号・牛名</TableCell>
                    <TableCell>繁殖方法</TableCell>
                    <TableCell>実施日</TableCell>
                    <TableCell>父牛・担当者</TableCell>
                    <TableCell>現在の段階</TableCell>
                    <TableCell>次対応・予定日</TableCell>
                    <TableCell>分娩予定</TableCell>
                    <TableCell>受胎確認</TableCell>
                    <TableCell>注意</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Typography fontWeight={700}>耳標：{item.cowEarTag || '未登録'}</Typography>
                        <Typography variant="caption">牛名：{item.cowName || '未登録'}</Typography>
                      </TableCell>
                      <TableCell>{item.breedingMethod || '未選択'}</TableCell>
                      <TableCell>{displayDate(performedDate(item))}</TableCell>
                      <TableCell>
                        <Typography variant="body2">父牛：{breedingSire(item)}</Typography>
                        <Typography variant="caption">担当：{breedingActor(item)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={currentStage(item)} color={stageColor(currentStage(item)) as any} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{nextAction(item).label}</Typography>
                        <Typography variant="caption">{displayDate(nextAction(item).date)}</Typography>
                      </TableCell>
                      <TableCell>
                        {displayDate(item.expectedCalvingDate)}
                        {item.expectedCalvingDate && <Typography variant="caption" display="block">あと{daysUntil(item.expectedCalvingDate)}日</Typography>}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={item.pregnancyResult || '未鑑定'}
                          color={resultColor(item.pregnancyResult) as any}
                        />
                      </TableCell>
                      <TableCell>
                        {cautionMessages(item).length > 0 ? (
                          <Typography variant="caption" color="warning.main">{cautionMessages(item)[0]}</Typography>
                        ) : (
                          <Typography variant="caption">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                          <IconButton component={RouterLink} to={`/breedings/${item.id}/edit`} aria-label="編集">
                            <EditIcon />
                          </IconButton>
                          <IconButton color="error" onClick={() => handleDelete(item)} aria-label="削除">
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="検索"
                placeholder="耳標・牛名・方法・段階・父牛・担当者"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="繁殖方法"
                select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                size="small"
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="未選択">未選択</MenuItem>
                <MenuItem value="種付">種付</MenuItem>
                <MenuItem value="受精卵移植">受精卵移植</MenuItem>
              </TextField>
              <TextField
                label="現在の段階"
                select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                size="small"
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="発情予定">発情予定</MenuItem>
                <MenuItem value="種付実施">種付実施</MenuItem>
                <MenuItem value="妊娠鑑定待ち">妊娠鑑定待ち</MenuItem>
                <MenuItem value="受胎確認">受胎確認</MenuItem>
                <MenuItem value="分娩待ち">分娩待ち</MenuItem>
                <MenuItem value="経過観察">経過観察</MenuItem>
                <MenuItem value="完了">完了</MenuItem>
              </TextField>
              <TextField
                label="受胎確認"
                select
                value={result}
                onChange={(e) => setResult(e.target.value)}
                size="small"
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="すべて">すべて</MenuItem>
                <MenuItem value="未鑑定">未鑑定</MenuItem>
                <MenuItem value="再鑑定予定">再鑑定予定</MenuItem>
                <MenuItem value="受胎">受胎</MenuItem>
                <MenuItem value="空胎">空胎</MenuItem>
                <MenuItem value="流産・胎子喪失">流産・胎子喪失</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearSearch} size="small">クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
