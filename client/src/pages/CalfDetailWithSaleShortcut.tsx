import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { getCalf } from '../services/calfApi';
import { getSalesList, SaleRecord } from '../services/salesApi';
import { CalfDetail } from './CalfDetail';

type CalfForSale = {
  id?: number | string;
  calfNumber?: string;
  earTag?: string;
  name?: string;
  calfName?: string;
  sex?: string;
  birthday?: string;
  birthDate?: string;
  motherName?: string;
  motherId?: string;
};

const noPrintSx = {
  '@media print': {
    display: 'none'
  }
};

function value(v: unknown) {
  return String(v ?? '').trim();
}

function normalize(v: unknown) {
  return value(v).toLowerCase();
}

function yen(valueText: string) {
  const n = Number(valueText);
  if (Number.isNaN(n) || valueText === '') return '-';
  return `${n.toLocaleString('ja-JP')}円`;
}

function statusColor(status: string) {
  if (status === '販売済み') return 'success';
  if (status === '出荷済み') return 'info';
  if (status === '取消') return 'default';
  return 'warning';
}

function sameSaleTarget(calf: CalfForSale | null, sale: SaleRecord) {
  if (!calf || sale.targetType !== '子牛') return false;

  const calfNumber = normalize(calf.calfNumber || calf.earTag);
  const calfName = normalize(calf.name || calf.calfName);
  const saleNumber = normalize(sale.targetNumber);
  const saleName = normalize(sale.targetName);

  if (calfNumber && saleNumber && calfNumber === saleNumber) return true;
  if (!calfNumber && calfName && saleName && calfName === saleName) return true;
  return false;
}

function saleDateForSort(sale: SaleRecord) {
  return sale.saleDate || sale.shippingDate || sale.shippingPlanDate || sale.updatedAt || sale.createdAt || '';
}

function salePrefillLink(calf: CalfForSale | null) {
  const params = new URLSearchParams();
  params.set('targetType', '子牛');
  params.set('targetNumber', value(calf?.calfNumber || calf?.earTag));
  params.set('targetName', value(calf?.name || calf?.calfName));
  params.set('sex', value(calf?.sex));
  params.set('birthday', value(calf?.birthday || calf?.birthDate));
  params.set('motherName', value(calf?.motherName || calf?.motherId));
  params.set('reason', '子牛販売');
  params.set('memo', '子牛カルテから登録');
  return `/sales/new?${params.toString()}`;
}

export function CalfDetailWithSaleShortcut() {
  const { id } = useParams();
  const [calf, setCalf] = useState<CalfForSale | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!id) return;
      try {
        const data = await getCalf(id);
        if (active) setCalf(data as CalfForSale);
      } catch {
        if (active) setCalf(null);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    async function loadSales() {
      try {
        const data = await getSalesList();
        if (active) setSales(Array.isArray(data) ? data : []);
      } catch {
        if (active) setSales([]);
      }
    }

    loadSales();

    return () => {
      active = false;
    };
  }, []);

  const link = useMemo(() => salePrefillLink(calf), [calf]);
  const disabled = !calf || (!value(calf.calfNumber || calf.earTag) && !value(calf.name || calf.calfName));
  const calfSales = useMemo(() => {
    return sales
      .filter((sale) => sameSaleTarget(calf, sale))
      .sort((a, b) => saleDateForSort(b).localeCompare(saleDateForSort(a)));
  }, [calf, sales]);

  return (
    <Stack spacing={2}>
      <Alert
        severity="info"
        sx={noPrintSx}
        action={
          <Button
            color="success"
            component={RouterLink}
            disabled={disabled}
            to={link}
            variant="contained"
          >
            この子を出荷・販売登録
          </Button>
        }
      >
        この子牛を出荷・販売する場合は、対象情報を引き継いで登録できます。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Stack spacing={0.5}>
                <Typography variant="h6" fontWeight={800}>出荷・販売記録</Typography>
                <Typography color="text.secondary">
                  この子牛に対して登録された出荷・販売記録を確認します。
                </Typography>
              </Stack>
              <Button component={RouterLink} to="/sales" variant="outlined" sx={noPrintSx}>
                出荷・販売管理へ
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Chip label={`出荷・販売記録 ${calfSales.length}件`} />
              <Chip label={`販売済み ${calfSales.filter((sale) => sale.status === '販売済み').length}件`} color="success" variant="outlined" />
            </Stack>

            {calfSales.length === 0 ? (
              <Alert severity="success">この子牛の出荷・販売記録はまだありません。</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>状態</TableCell>
                    <TableCell>対象番号</TableCell>
                    <TableCell>対象名</TableCell>
                    <TableCell>出荷日</TableCell>
                    <TableCell>販売日</TableCell>
                    <TableCell>販売先</TableCell>
                    <TableCell>販売金額</TableCell>
                    <TableCell>メモ</TableCell>
                    <TableCell sx={noPrintSx}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {calfSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <Chip size="small" color={statusColor(sale.status) as any} label={value(sale.status) || '-'} />
                      </TableCell>
                      <TableCell>{value(sale.targetNumber) || '-'}</TableCell>
                      <TableCell>{value(sale.targetName) || '-'}</TableCell>
                      <TableCell>{value(sale.shippingDate) || '-'}</TableCell>
                      <TableCell>{value(sale.saleDate) || '-'}</TableCell>
                      <TableCell>{value(sale.buyer) || '-'}</TableCell>
                      <TableCell>{yen(value(sale.salePrice))}</TableCell>
                      <TableCell>{value(sale.memo) || '-'}</TableCell>
                      <TableCell sx={noPrintSx}>
                        <Button component={RouterLink} to={`/sales/${sale.id}/edit`} variant="outlined" size="small">
                          編集
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        </CardContent>
      </Card>

      <CalfDetail />
    </Stack>
  );
}

export default CalfDetailWithSaleShortcut;
