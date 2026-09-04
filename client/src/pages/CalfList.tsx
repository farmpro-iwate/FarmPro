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
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { deleteCalf, getCalfList, promoteCalf } from '../services/calfApi';
import { getCattleList } from '../services/api';
import type { Calf, CalfStatus } from '../types/calf';
import { formatSex } from '../utils/sex';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

type CattleLinkRow = {
  id: number;
  earTag?: string;
  identificationNumber?: string;
  name?: string;
};

function calcAgeDays(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  return Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function statusColor(status: CalfStatus): 'warning' | 'success' | 'info' | 'default' | 'primary' {
  if (status === '繁殖候補として留保') return 'warning';
  if (status === '牛台帳へ移行済み') return 'success';
  if (status === '販売予定') return 'info';
  if (status === '死亡・その他') return 'default';
  return 'primary';
}

function calfDisplayName(row: Calf) {
  if (!row.name || row.name === '耳標未装着' || row.name.startsWith('TEMP-')) {
    return '子牛（耳標未装着）';
  }
  return row.name;
}

function isFemaleSex(sex?: string) {
  return sex === '雌' || sex === 'メス';
}

function matchesSexFilter(sex: string, filter: string) {
  if (filter === 'すべて') return true;
  if (filter === '雌') return isFemaleSex(sex);
  if (filter === '雄') return sex === '雄' || sex === 'オス';
  return sex === filter;
}

function resolveMotherCattleId(row: Calf, cattleRows: CattleLinkRow[]) {
  const motherIds = [row.recipientCowId, row.motherCowId, row.geneticMotherCowId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const idMatches = cattleRows.filter((cattle) => {
    const keys = [cattle.id, cattle.earTag, cattle.identificationNumber]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return motherIds.some((motherId) => keys.includes(motherId));
  });
  if (idMatches.length === 1) return idMatches[0].id;

  const motherName = String(row.motherName || '').trim();
  if (!motherName) return null;
  const nameMatches = cattleRows.filter((cattle) => String(cattle.name || '').trim() === motherName);
  return nameMatches.length === 1 ? nameMatches[0].id : null;
}

function saleRegistrationLink(row: Calf) {
  const params = new URLSearchParams();
  const calfNumber = String(row.calfNumber || '');
  params.set('source', 'calf');
  params.set('targetType', '子牛');
  params.set('targetNumber', calfNumber.startsWith('TEMP-') ? '' : calfNumber);
  params.set('targetName', String(row.name || ''));
  params.set('sex', String(row.sex || ''));
  params.set('birthday', String(row.birthday || ''));
  params.set('motherName', String(row.motherName || ''));
  params.set('calfId', String(row.id || ''));
  params.set('calvingId', String(row.calvingId || ''));
  params.set('motherCowId', String(row.recipientCowId || row.motherCowId || ''));
  params.set('returnTo', '/calves');
  return `/sales/new?${params.toString()}`;
}

export function CalfList() {
  const [rows, setRows] = useState<Calf[]>([]);
  const [cattleRows, setCattleRows] = useState<CattleLinkRow[]>([]);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('すべて');
  const [statusFilter, setStatusFilter] = useState('すべて');
  const [feedingFilter, setFeedingFilter] = useState('すべて');
  const [weaningFilter, setWeaningFilter] = useState('すべて');
  const [message, setMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<Calf | null>(null);

  const load = async () => {
    const [calfRows, cattle] = await Promise.all([
      getCalfList(),
      getCattleList().catch(() => []),
    ]);
    setRows(calfRows);
    setCattleRows(cattle as CattleLinkRow[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const keyword = search.trim().toLowerCase();
    const feedingMethod = row.feedingMethod || '人工哺育';
    const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
    const status = row.managementStatus || '育成中';
    const keywordOk = !keyword || [row.name, row.calfNumber, row.identificationNumber, row.motherName]
      .some((value) => String(value || '').toLowerCase().includes(keyword));
    const sexOk = matchesSexFilter(row.sex, sexFilter);
    const statusOk = statusFilter === 'すべて' || status === statusFilter;
    const feedingOk = feedingFilter === 'すべて' || feedingMethod === feedingFilter;
    const weaningOk = weaningFilter === 'すべて' || weaningStatus === weaningFilter;
    return keywordOk && sexOk && statusOk && feedingOk && weaningOk;
  }), [rows, search, sexFilter, statusFilter, feedingFilter, weaningFilter]);

  const summary = useMemo(() => ({
    nursing: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳前').length,
    weaned: rows.filter((row) => (row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前')) === '離乳済み').length,
    retained: rows.filter((row) => row.managementStatus === '繁殖候補として留保').length,
  }), [rows]);

  const clearFilters = () => {
    setSearch('');
    setSexFilter('すべて');
    setStatusFilter('すべて');
    setFeedingFilter('すべて');
    setWeaningFilter('すべて');
  };

  const hasFilters = Boolean(
    search || sexFilter !== 'すべて' || statusFilter !== 'すべて' ||
    feedingFilter !== 'すべて' || weaningFilter !== 'すべて'
  );

  const openMenu = (event: React.MouseEvent<HTMLElement>, row: Calf) => {
    setMenuAnchor(event.currentTarget);
    setMenuRow(row);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCalf(id);
    await load();
  };

  const handlePromote = async (row: Calf) => {
    if (!confirm(`${calfDisplayName(row)}を牛台帳へ移行しますか？\n牛台帳では「育成牛」として登録されます。`)) return;
    try {
      const cattle = await promoteCalf(String(row.id));
      setMessage(`${calfDisplayName(row)}を牛台帳へ移行しました。`);
      await load();
      window.location.href = `/cattle/${cattle.id}`;
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || '牛台帳への移行に失敗しました');
    }
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>子牛台帳</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}
          </Button>
          <Button component={RouterLink} to="/calves/new" variant="contained">新規登録</Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={`離乳前 ${summary.nursing}頭`} color="warning" variant="outlined" />
        <Chip label={`離乳済み ${summary.weaned}頭`} color="success" variant="outlined" />
        <Chip label={`繁殖候補 ${summary.retained}頭`} color="primary" variant="outlined" />
      </Stack>

      {message && <Alert severity="success">{message}</Alert>}

      {searchOpen && <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <TextField label="名前・耳標番号・母牛で検索" value={search} onChange={(e) => setSearch(e.target.value)} size="small" fullWidth />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField label="性別" select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="雄">♂</MenuItem><MenuItem value="雌">♀</MenuItem><MenuItem value="去勢">♂去</MenuItem>
              </TextField>
              <TextField label="飼養区分" select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="販売予定">販売予定</MenuItem><MenuItem value="育成中">育成中</MenuItem><MenuItem value="繁殖候補として留保">繁殖候補として留保</MenuItem><MenuItem value="牛台帳へ移行済み">牛台帳へ移行済み</MenuItem><MenuItem value="死亡・その他">死亡・その他</MenuItem>
              </TextField>
              <TextField label="哺育方法" select value={feedingFilter} onChange={(e) => setFeedingFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="人工哺育">人工哺育</MenuItem><MenuItem value="母乳哺育">母乳哺育</MenuItem><MenuItem value="混合哺育">混合哺育</MenuItem>
              </TextField>
              <TextField label="離乳状態" select value={weaningFilter} onChange={(e) => setWeaningFilter(e.target.value)} size="small" fullWidth>
                <MenuItem value="すべて">すべて</MenuItem><MenuItem value="離乳前">離乳前</MenuItem><MenuItem value="離乳済み">離乳済み</MenuItem>
              </TextField>
              <Button variant="outlined" onClick={clearFilters}>クリア</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>}

      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>名前・耳標番号</TableCell>
                <TableCell>状態</TableCell>
                <TableCell>生年月日・日齢</TableCell>
                <TableCell>母牛</TableCell>
                <TableCell>現在体重</TableCell>
                <TableCell>離乳</TableCell>
                <TableCell align="center">子牛情報</TableCell>
                <TableCell align="center">販売</TableCell>
                <TableCell align="center" sx={{ width: 56 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRows.map((row) => {
                const status = row.managementStatus || '育成中';
                const feedingMethod = row.feedingMethod || '人工哺育';
                const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
                const motherCattleId = resolveMotherCattleId(row, cattleRows);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography fontWeight={800}>{calfDisplayName(row)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {row.calfNumber?.startsWith('TEMP-')
                          ? formatTemporaryCalfNumber(row.calfNumber, row.birthday)
                          : `耳標 ${row.calfNumber || '-'}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        <Chip label={formatSex(row.sex)} size="small" />
                        <Chip label={status} size="small" color={statusColor(status)} />
                        <Chip label={feedingMethod} size="small" variant="outlined" />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.birthday || '-'}</Typography>
                      <Typography variant="body2" color="text.secondary">{calcAgeDays(row.birthday) ?? '-'}日</Typography>
                    </TableCell>
                    <TableCell>
                      {motherCattleId ? (
                        <Button component={RouterLink} to={`/cattle/${motherCattleId}`} variant="text" size="small" sx={{ minWidth: 0, px: 0 }}>
                          {row.motherName || '母牛カルテ'}
                        </Button>
                      ) : (row.motherName || '-')}
                    </TableCell>
                    <TableCell>{row.currentWeight ? `${row.currentWeight}kg` : '-'}</TableCell>
                    <TableCell>
                      <Chip label={weaningStatus} size="small" color={weaningStatus === '離乳済み' ? 'success' : 'warning'} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {row.weaningDate || row.weaningPlannedDate || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Button component={RouterLink} to={`/calves/${row.id}`} variant="outlined" size="small">開く</Button>
                    </TableCell>
                    <TableCell align="center">
                      <Button component={RouterLink} to={saleRegistrationLink(row)} variant="contained" size="small">販売登録</Button>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton aria-label={`${calfDisplayName(row)}の操作`} onClick={(event) => openMenu(event, row)}>
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      <Stack spacing={1.5}>
      {filteredRows.map((row) => {
        const status = row.managementStatus || '育成中';
        const feedingMethod = row.feedingMethod || '人工哺育';
        const weaningStatus = row.weaningStatus || (row.weaningDate ? '離乳済み' : '離乳前');
        const canPromote = isFemaleSex(row.sex) && status === '繁殖候補として留保';
        const motherCattleId = resolveMotherCattleId(row, cattleRows);
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
                  <Typography variant="h6" fontWeight={800}>{calfDisplayName(row)}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={formatSex(row.sex)} size="small" />
                    <Chip label={status} size="small" color={statusColor(status)} />
                    <Chip label={feedingMethod} size="small" variant="outlined" />
                    <Chip label={weaningStatus} size="small" color={weaningStatus === '離乳済み' ? 'success' : 'warning'} />
                  </Stack>
                </Stack>
                <Typography>耳標番号：{row.calfNumber?.startsWith('TEMP-') ? '未装着' : row.calfNumber || '-'}</Typography>
                {row.calfNumber?.startsWith('TEMP-') && (
                  <Typography color="text.secondary">仮管理番号：{formatTemporaryCalfNumber(row.calfNumber, row.birthday)}</Typography>
                )}
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'} / 日齢：{calcAgeDays(row.birthday) ?? '-'}日</Typography>
                {motherCattleId ? (
                  <Button component={RouterLink} to={`/cattle/${motherCattleId}`} variant="text" sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0 }}>
                    母牛：{row.motherName || '個体カルテを開く'}
                  </Button>
                ) : (
                  <Typography color="text.secondary">母牛：{row.motherName || '-'}</Typography>
                )}
                <Typography color="text.secondary">現在体重：{row.currentWeight || '-'}kg</Typography>
                <Typography color="text.secondary">離乳予定日：{row.weaningPlannedDate || '-'} / 実際の離乳日：{row.weaningDate || '-'}</Typography>
                {feedingMethod === '人工哺育' && <Typography color="text.secondary">ミルク終了日：{row.milkEndDate || '-'}</Typography>}
                {feedingMethod === '混合哺育' && <Typography color="text.secondary">補助ミルク終了日：{row.milkEndDate || '-'}</Typography>}
                {weaningStatus === '離乳済み' && (
                  <Typography color="text.secondary">離乳時体重：{row.weaningWeight || '-'}kg / スターター：{row.weaningStarterAmount || '-'}kg</Typography>
                )}
                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}
                <Divider />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
                  <Button component={RouterLink} to={`/calves/${row.id}`} variant="contained">子牛情報</Button>
                  <Button component={RouterLink} to={saleRegistrationLink(row)} variant="contained">販売登録</Button>
                  <Button component={RouterLink} to={`/calves/${row.id}/edit`} variant="outlined">編集</Button>
                  {canPromote && <Button color="success" variant="contained" onClick={() => handlePromote(row)}>牛台帳へ移行</Button>}
                  {status === '牛台帳へ移行済み' && row.promotedCattleId && <Button component={RouterLink} to={`/cattle/${row.promotedCattleId}`} color="success" variant="outlined">牛情報</Button>}
                  <Button color="error" variant="text" onClick={() => handleDelete(row.id)}>削除</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
      </Stack>
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        {menuRow && <MenuItem component={RouterLink} to={`/calves/${menuRow.id}/edit`} onClick={closeMenu}>編集</MenuItem>}
        {menuRow && isFemaleSex(menuRow.sex) && (menuRow.managementStatus || '育成中') === '繁殖候補として留保' && (
          <MenuItem
            sx={{ color: 'success.main' }}
            onClick={() => {
              const row = menuRow;
              closeMenu();
              void handlePromote(row);
            }}
          >
            牛台帳へ移行
          </MenuItem>
        )}
        {menuRow?.managementStatus === '牛台帳へ移行済み' && menuRow.promotedCattleId && (
          <MenuItem component={RouterLink} to={`/cattle/${menuRow.promotedCattleId}`} onClick={closeMenu}>牛情報を開く</MenuItem>
        )}
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            const id = menuRow?.id;
            closeMenu();
            if (id !== undefined) void handleDelete(id);
          }}
        >
          削除
        </MenuItem>
      </Menu>

      {filteredRows.length === 0 && <Alert severity="info">該当する子牛がありません。</Alert>}
    </Stack>
  );
}
