import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { getCalf } from '../services/calfApi';
import { getVaccineList } from '../services/vaccineApi';
import { getScheduleList } from '../services/scheduleApi';
import { getTreatmentList } from '../services/treatmentApi';

type AnyRow = Record<string, any>;

function value(v: unknown) {
  return v === undefined || v === null || v === '' ? '-' : String(v);
}

function calcAgeDays(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  return Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
}

function calcDg(birthday?: string, birthWeight?: number | string, currentWeight?: number | string) {
  const days = calcAgeDays(birthday);
  const bw = Number(birthWeight);
  const cw = Number(currentWeight);
  if (!days || days <= 0 || Number.isNaN(bw) || Number.isNaN(cw)) return null;
  return ((cw - bw) / days).toFixed(2);
}

function sameCalf(row: AnyRow, calf: AnyRow) {
  const number = calf.calfNumber;
  const name = calf.name;

  return [
    row.targetNumber,
    row.calfNumber
  ].includes(number) || [
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

export function CalfDetail() {
  const { id } = useParams();
  const [calf, setCalf] = useState<AnyRow | null>(null);
  const [vaccines, setVaccines] = useState<AnyRow[]>([]);
  const [schedules, setSchedules] = useState<AnyRow[]>([]);
  const [treatments, setTreatments] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const calfData = await getCalf(id);
      setCalf(calfData as AnyRow);

      const [vaccineData, scheduleData, treatmentData] = await Promise.all([
        getVaccineList().catch(() => []),
        getScheduleList().catch(() => []),
        getTreatmentList().catch(() => [])
      ]);

      setVaccines((vaccineData as AnyRow[]).filter((row) => sameCalf(row, calfData as AnyRow)));
      setSchedules((scheduleData as AnyRow[]).filter((row) => sameCalf(row, calfData as AnyRow)));
      setTreatments((treatmentData as AnyRow[]).filter((row) => sameCalf(row, calfData as AnyRow)));
      setLoading(false);
    }

    load();
  }, [id]);

  const ageDays = useMemo(() => calcAgeDays(calf?.birthday), [calf]);
  const dg = useMemo(() => calcDg(calf?.birthday, calf?.birthWeight, calf?.currentWeight), [calf]);
  const totalRecords = vaccines.length + schedules.length + treatments.length;

  if (loading) return <Typography>読み込み中...</Typography>;
  if (!calf) return <Alert severity="error">子牛の情報が見つかりません。</Alert>;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} className="no-print">
        <Button component={RouterLink} to="/calves" variant="outlined">子牛管理へ戻る</Button>
        <Button component={RouterLink} to={`/calves/${calf.id}/edit`} variant="outlined">編集</Button>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" fontWeight={800}>子牛カルテ：{value(calf.name)}</Typography>
              <Chip label={value(calf.sex)} />
            </Stack>

            <Typography color="text.secondary">繁殖Farm Pro / 子牛ごとの履歴確認</Typography>
            <Typography color="text.secondary">関連記録：{totalRecords}件</Typography>

            <Divider />

            <Typography variant="h6" fontWeight={800}>基本情報</Typography>
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>子牛番号</TableCell><TableCell>{value(calf.calfNumber)}</TableCell></TableRow>
                <TableRow><TableCell>名号</TableCell><TableCell>{value(calf.name)}</TableCell></TableRow>
                <TableRow><TableCell>性別</TableCell><TableCell>{value(calf.sex)}</TableCell></TableRow>
                <TableRow><TableCell>生年月日</TableCell><TableCell>{value(calf.birthday)}</TableCell></TableRow>
                <TableRow><TableCell>日齢</TableCell><TableCell>{ageDays === null ? '-' : `${ageDays}日`}</TableCell></TableRow>
                <TableRow><TableCell>母牛</TableCell><TableCell>{value(calf.motherName)}</TableCell></TableRow>
                <TableRow><TableCell>出生体重</TableCell><TableCell>{value(calf.birthWeight)} kg</TableCell></TableRow>
                <TableRow><TableCell>現在体重</TableCell><TableCell>{value(calf.currentWeight)} kg</TableCell></TableRow>
                <TableRow><TableCell>DG</TableCell><TableCell>{dg === null ? '-' : `${dg} kg/日`}</TableCell></TableRow>
                <TableRow><TableCell>備考</TableCell><TableCell>{value(calf.note)}</TableCell></TableRow>
              </TableBody>
            </Table>

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
