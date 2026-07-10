import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getCattle } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getScheduleList } from '../services/scheduleApi';
import { getTreatmentList } from '../services/treatmentApi';
import { getSalesList } from '../services/salesApi';

type AnyRow = Record<string, any>;

type TimelineItem = {
  id: string;
  date: string;
  category: string;
  title: string;
  detail: string;
};

function value(v: unknown) {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function dateOnly(v: unknown) {
  return v ? String(v).slice(0, 10) : '';
}

function sameCow(row: AnyRow, cattle: AnyRow) {
  const earTag = cattle.earTag;
  const name = cattle.name;

  return [
    row.cowEarTag,
    row.targetNumber,
    row.earTag,
  ].includes(earTag) || [
    row.cowName,
    row.targetName,
    row.name,
  ].includes(name);
}

async function fetchList(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function SmallTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: AnyRow[] }) {
  if (rows.length === 0) {
    return <Typography color="text.secondary">記録はありません。</Typography>;
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {columns.map((col) => <TableCell key={col.key}>{col.label}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.id || index}>
            {columns.map((col) => <TableCell key={col.key}>{value(row[col.key])}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CattleDetail() {
  const { id } = useParams();
  const [cattle, setCattle] = useState<AnyRow | null>(null);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [vaccines, setVaccines] = useState<AnyRow[]>([]);
  const [blvTests, setBlvTests] = useState<AnyRow[]>([]);
  const [schedules, setSchedules] = useState<AnyRow[]>([]);
  const [treatments, setTreatments] = useState<AnyRow[]>([]);
  const [calvings, setCalvings] = useState<AnyRow[]>([]);
  const [sales, setSales] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const cattleData = await getCattle(id);
      setCattle(cattleData as AnyRow);

      const [breedingData, vaccineData, blvData, scheduleData, treatmentData, calvingData, salesData] = await Promise.all([
        getBreedingList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getScheduleList().catch(() => []),
        getTreatmentList().catch(() => []),
        fetchList('http://localhost:4000/api/calvings'),
        getSalesList().catch(() => []),
      ]);

      const selected = cattleData as AnyRow;
      setBreedings((breedingData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setVaccines((vaccineData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setBlvTests((blvData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setSchedules((scheduleData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setTreatments((treatmentData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setCalvings((calvingData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setSales((salesData as AnyRow[]).filter((row) => sameCow(row, selected)));
      setLoading(false);
    }

    load();
  }, [id]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    if (cattle) {
      const registeredDate = dateOnly(cattle.createdAt || cattle.updatedAt || cattle.birthday);
      if (registeredDate) items.push({
        id: `cattle-${cattle.id}`,
        date: registeredDate,
        category: '牛台帳',
        title: '個体を登録',
        detail: `耳標 ${value(cattle.earTag)}　${value(cattle.name)}`,
      });
    }

    breedings.forEach((row) => {
      const common = `種雄牛・受精卵：${value(row.bullName || row.embryoName || row.embryoId)}`;
      const heatDate = dateOnly(row.heatDate);
      if (heatDate) items.push({ id: `heat-${row.id}`, date: heatDate, category: '発情', title: '発情を確認', detail: value(row.heatMemo || row.memo) });

      const inseminationDate = dateOnly(row.inseminationDate);
      if (inseminationDate) items.push({ id: `insemination-${row.id}`, date: inseminationDate, category: '種付', title: '人工授精・種付', detail: common });

      const transferDate = dateOnly(row.transferDate || row.actualTransferDate);
      if (transferDate) items.push({ id: `transfer-${row.id}`, date: transferDate, category: '移植', title: '受精卵移植', detail: common });

      const pregnancyDate = dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate);
      if (pregnancyDate) items.push({ id: `pregnancy-${row.id}`, date: pregnancyDate, category: '妊娠鑑定', title: `結果：${value(row.pregnancyResult)}`, detail: value(row.pregnancyMemo || row.memo) });
    });

    calvings.forEach((row) => {
      const date = dateOnly(row.actualCalvingDate || row.calvingDate);
      if (date) items.push({ id: `calving-${row.id}`, date, category: '分娩', title: `結果：${value(row.calvingResult)}`, detail: `子牛：${value(row.calfName)}　性別：${value(row.calfSex)}` });
    });

    treatments.forEach((row) => {
      const date = dateOnly(row.treatmentDate);
      if (date) items.push({ id: `treatment-${row.id}`, date, category: '治療', title: value(row.symptom || '治療記録'), detail: `薬剤：${value(row.medicine)}　経過：${value(row.progress)}` });
    });

    vaccines.forEach((row) => {
      const date = dateOnly(row.vaccinationDate);
      if (date) items.push({ id: `vaccine-${row.id}`, date, category: 'ワクチン', title: value(row.vaccineName), detail: `状態：${value(row.status)}　次回：${value(row.nextDueDate)}` });
    });

    blvTests.forEach((row) => {
      const date = dateOnly(row.testDate);
      if (date) items.push({ id: `blv-${row.id}`, date, category: 'BLV', title: `検査結果：${value(row.result)}`, detail: `次回検査：${value(row.nextTestDate)}` });
    });

    sales.forEach((row) => {
      const date = dateOnly(row.saleDate || row.shippingDate || row.shippingPlanDate);
      if (date) items.push({ id: `sale-${row.id}`, date, category: '販売', title: value(row.status || '出荷・販売'), detail: `市場・買受人：${value(row.marketName || row.buyer)}　価格：${value(row.salePrice)}円` });
    });

    schedules.forEach((row) => {
      if (row.status !== '完了') return;
      const date = dateOnly(row.dueDate);
      if (date) items.push({ id: `schedule-${row.id}`, date, category: 'その他', title: value(row.title || row.scheduleType), detail: value(row.memo || row.status) });
    });

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [blvTests, breedings, calvings, cattle, sales, schedules, treatments, vaccines]);

  const totalRecords = timeline.length;

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!cattle) return <Alert severity="error">牛の情報が見つかりません。</Alert>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} className="no-print">
        <Button component={RouterLink} to="/cattle" variant="outlined">牛台帳へ戻る</Button>
        <Button component={RouterLink} to={`/cattle/${cattle.id}/edit`} variant="outlined">編集</Button>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={800}>個体カルテ：{value(cattle.name)}</Typography>
              <Chip label={value(cattle.blvStatus)} />
            </Stack>

            <Typography color="text.secondary">耳標 {value(cattle.earTag)}　個体識別番号 {value(cattle.identificationNumber)}</Typography>
            <Typography color="text.secondary">個体ストーリー：{totalRecords}件</Typography>

            <Divider />

            <Typography variant="h5" fontWeight={900}>個体ストーリー</Typography>
            <Typography color="text.secondary">発情、種付・移植、妊娠鑑定、分娩、治療、ワクチン、BLV、販売などを新しい順に表示します。</Typography>
            {timeline.length === 0 ? (
              <Alert severity="info">この牛の活動記録はまだありません。</Alert>
            ) : (
              <Stack spacing={1}>
                {timeline.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                        <Typography fontWeight={900} sx={{ minWidth: 105 }}>{item.date}</Typography>
                        <Chip size="small" label={item.category} />
                        <Stack spacing={0.25} sx={{ flexGrow: 1 }}>
                          <Typography fontWeight={800}>{item.title}</Typography>
                          <Typography color="text.secondary">{item.detail}</Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}

            <Divider />

            <Typography variant="h6" fontWeight={800}>基本情報</Typography>
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>耳標番号</TableCell><TableCell>{value(cattle.earTag)}</TableCell></TableRow>
                <TableRow><TableCell>個体識別番号</TableCell><TableCell>{value(cattle.identificationNumber)}</TableCell></TableRow>
                <TableRow><TableCell>名号</TableCell><TableCell>{value(cattle.name)}</TableCell></TableRow>
                <TableRow><TableCell>生年月日</TableCell><TableCell>{value(cattle.birthday)}</TableCell></TableRow>
                <TableRow><TableCell>父牛</TableCell><TableCell>{value(cattle.sire)}</TableCell></TableRow>
                <TableRow><TableCell>母牛</TableCell><TableCell>{value(cattle.dam)}</TableCell></TableRow>
                <TableRow><TableCell>BLV状態</TableCell><TableCell>{value(cattle.blvStatus)}</TableCell></TableRow>
                <TableRow><TableCell>備考</TableCell><TableCell>{value(cattle.note)}</TableCell></TableRow>
              </TableBody>
            </Table>

            <Divider />

            <Typography variant="h6" fontWeight={800}>繁殖記録</Typography>
            <SmallTable
              rows={breedings}
              columns={[
                { key: 'inseminationDate', label: '授精日' },
                { key: 'bullName', label: '種雄牛' },
                { key: 'pregnancyResult', label: '妊娠結果' },
                { key: 'expectedCalvingDate', label: '分娩予定日' },
              ]}
            />

            <Divider />

            <Typography variant="h6" fontWeight={800}>ワクチン記録</Typography>
            <SmallTable
              rows={vaccines}
              columns={[
                { key: 'vaccineName', label: 'ワクチン名' },
                { key: 'vaccinationDate', label: '接種日' },
                { key: 'nextDueDate', label: '次回予定日' },
                { key: 'status', label: '状態' },
              ]}
            />

            <Divider />

            <Typography variant="h6" fontWeight={800}>BLV検査記録</Typography>
            <SmallTable
              rows={blvTests}
              columns={[
                { key: 'testDate', label: '検査日' },
                { key: 'result', label: '結果' },
                { key: 'nextTestDate', label: '次回検査日' },
                { key: 'isolationMemo', label: '隔離メモ' },
              ]}
            />

            <Divider />

            <Typography variant="h6" fontWeight={800}>予定</Typography>
            <SmallTable
              rows={schedules}
              columns={[
                { key: 'scheduleType', label: '区分' },
                { key: 'title', label: 'タイトル' },
                { key: 'dueDate', label: '予定日' },
                { key: 'status', label: '状態' },
              ]}
            />

            <Divider />

            <Typography variant="h6" fontWeight={800}>治療記録</Typography>
            <SmallTable
              rows={treatments}
              columns={[
                { key: 'treatmentDate', label: '治療日' },
                { key: 'symptom', label: '症状' },
                { key: 'medicine', label: '薬剤' },
                { key: 'progress', label: '経過' },
                { key: 'withdrawalEndDate', label: '休薬終了日' },
              ]}
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
