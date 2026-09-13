import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { getCattleList } from '../services/api';
import { getSalesList, type SaleRecord } from '../services/salesApi';

type CattleRow = {
  id: number | string;
  earTag?: string;
  identificationNumber?: string;
  name?: string;
};

type SoldCattleRow = {
  saleId: string;
  cattleId: string;
  saleDate: string;
  name: string;
  earTag: string;
  salePrice: number | null;
  productionCost: number | null;
  profit: number | null;
};

function numericValue(value: unknown): number | null {
  const normalized = String(value ?? '').replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function yen(value: number | null) {
  return value === null ? '-' : `${Math.round(value).toLocaleString('ja-JP')}円`;
}

function resolveCattle(sale: SaleRecord, cattle: CattleRow[]) {
  const cattleId = String(sale.cattleId || '').trim();
  if (cattleId) {
    const byId = cattle.find((row) => String(row.id) === cattleId);
    if (byId) return byId;
  }

  const targetNumber = String(sale.targetNumber || '').trim();
  if (targetNumber) {
    const byNumber = cattle.find((row) =>
      [row.earTag, row.identificationNumber]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .includes(targetNumber),
    );
    if (byNumber) return byNumber;
  }

  const targetName = String(sale.targetName || '').trim();
  if (!targetName) return null;
  const byName = cattle.filter((row) => String(row.name || '').trim() === targetName);
  return byName.length === 1 ? byName[0] : null;
}

export function SoldCattleList() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [cattle, setCattle] = useState<CattleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const [salesData, cattleData] = await Promise.all([
        getSalesList().catch(() => []),
        getCattleList().catch(() => []),
      ]);
      if (!active) return;
      setSales(salesData as SaleRecord[]);
      setCattle(cattleData as CattleRow[]);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo<SoldCattleRow[]>(() => {
    return sales
      .filter((sale) => sale.status === '販売済み' && sale.targetType === '成牛')
      .map((sale) => {
        const matched = resolveCattle(sale, cattle);
        return {
          saleId: sale.id,
          cattleId: matched ? String(matched.id) : String(sale.cattleId || ''),
          saleDate: String(sale.saleDate || '').slice(0, 10),
          name: String(matched?.name || sale.targetName || '-'),
          earTag: String(matched?.earTag || sale.targetNumber || '-'),
          salePrice: numericValue(sale.salePrice),
          productionCost: sale.productionCostSnapshot === undefined ? null : Number(sale.productionCostSnapshot),
          profit: sale.profitSnapshot === undefined ? null : Number(sale.profitSnapshot),
        };
      })
      .sort((left, right) => right.saleDate.localeCompare(left.saleDate));
  }, [cattle, sales]);

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={900}>販売済み牛一覧</Typography>
          <Typography color="text.secondary">販売済みの成牛を、販売時の確定値で表示します。</Typography>
        </Stack>
        <Button component={RouterLink} to="/cattle" variant="outlined">繁殖牛台帳へ戻る</Button>
      </Stack>

      <Card>
        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Typography fontWeight={900}>販売済み：{rows.length}頭</Typography>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Alert severity="info">販売済みの成牛はありません。</Alert>
      ) : (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableContainer component={Card}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>販売日</TableCell>
                    <TableCell>名号・耳標番号</TableCell>
                    <TableCell align="right">販売額</TableCell>
                    <TableCell align="right">生産費</TableCell>
                    <TableCell align="right">利益</TableCell>
                    <TableCell align="center">個体カルテ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.saleId} hover>
                      <TableCell>{row.saleDate || '-'}</TableCell>
                      <TableCell>
                        <Typography fontWeight={800}>{row.name}</Typography>
                        <Typography variant="body2" color="text.secondary">耳標 {row.earTag}</Typography>
                      </TableCell>
                      <TableCell align="right">{yen(row.salePrice)}</TableCell>
                      <TableCell align="right">{yen(row.productionCost)}</TableCell>
                      <TableCell align="right"><Typography fontWeight={900}>{yen(row.profit)}</Typography></TableCell>
                      <TableCell align="center">
                        {row.cattleId ? (
                          <Button component={RouterLink} to={`/cattle/${row.cattleId}`} variant="outlined" size="small">開く</Button>
                        ) : (
                          <Typography variant="body2" color="text.secondary">未連携</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            <Stack spacing={1}>
              {rows.map((row) => (
                <Card key={row.saleId} variant="outlined">
                  <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography fontWeight={900}>{row.name}</Typography>
                        <Typography color="text.secondary">{row.saleDate || '-'}</Typography>
                      </Stack>
                      <Typography color="text.secondary">耳標 {row.earTag}</Typography>
                      <Stack direction="row" justifyContent="space-between"><Typography>販売額</Typography><Typography fontWeight={800}>{yen(row.salePrice)}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography>生産費</Typography><Typography fontWeight={800}>{yen(row.productionCost)}</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography>利益</Typography><Typography fontWeight={900}>{yen(row.profit)}</Typography></Stack>
                      {row.cattleId ? (
                        <Button component={RouterLink} to={`/cattle/${row.cattleId}`} variant="outlined" fullWidth>個体カルテを開く</Button>
                      ) : (
                        <Alert severity="warning">この販売記録は牛台帳との連携先を特定できません。</Alert>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
}
