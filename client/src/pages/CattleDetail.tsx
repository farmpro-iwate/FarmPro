import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getCattle } from '../services/api';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getScheduleList } from '../services/scheduleApi';
import { getTreatmentList } from '../services/treatmentApi';

type AnyRow = Record<string, any>;

function value(v: unknown) {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function sameCow(row: AnyRow, cattle: AnyRow) {
  const earTag = cattle.earTag;
  const name = cattle.name;

  return [
    row.cowEarTag,
    row.targetNumber,
    row.earTag
  ].includes(earTag) || [
    row.cowName,
    row.targetName,
    row.name
  ].includes(name);
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const cattleData = await getCattle(id);
      setCattle(cattleData as AnyRow);

      const [breedingData, vaccineData, blvData, scheduleData, treatmentData] = await Promise.all([
        getBreedingList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getScheduleList().catch(() => []),
        getTreatmentList().catch(() => [])
      ]);

      setBreedings((breedingData as AnyRow[]).filter((row) => sameCow(row, cattleData as AnyRow)));
      setVaccines((vaccineData as AnyRow[]).filter((row) => sameCow(row, cattleData as AnyRow)));
      setBlvTests((blvData as AnyRow[]).filter((row) => sameCow(row, cattleData as AnyRow)));
      setSchedules((scheduleData as AnyRow[]).filter((row) => sameCow(row, cattleData as AnyRow)));
      setTreatments((treatmentData as AnyRow[]).filter((row) => sameCow(row, cattleData as AnyRow)));
      setLoading(false);
    }

    load();
  }, [id]);

  const totalRecords = useMemo(() => {
    return breedings.length + vaccines.length + blvTests.length + schedules.length + treatments.length;
  }, [breedings, vaccines, blvTests, schedules, treatments]);

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!cattle) return <Alert severity="error">繁殖牛の情報が見つかりません。</Alert>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} className="no-print">
        <Button component={RouterLink} to="/cattle" variant="outlined">繁殖牛台帳へ戻る</Button>
        <Button component={RouterLink} to={`/cattle/${cattle.id}/edit`} variant="outlined">編集</Button>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={800}>繁殖牛カルテ：{value(cattle.name)}</Typography>
              <Chip label={value(cattle.blvStatus)} />
            </Stack>

            <Typography color="text.secondary">繁殖Farm Pro / 繁殖牛ごとの履歴確認</Typography>
            <Typography color="text.secondary">関連記録：{totalRecords}件</Typography>

            <Divider />

            <Typography variant="h6" fontWeight={800}>基本情報</Typography>
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>耳標番号</TableCell><TableCell>{value(cattle.earTag)}</TableCell></TableRow>
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
                { key: 'expectedCalvingDate', label: '分娩予定日' }
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
                { key: 'status', label: '状態' }
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
                { key: 'isolationMemo', label: '隔離メモ' }
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
                { key: 'status', label: '状態' }
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
                { key: 'withdrawalEndDate', label: '休薬終了日' }
              ]}
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
