import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, Divider, Grid, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { getScheduleList } from '../services/scheduleApi';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';
import { getTreatmentList } from '../services/treatmentApi';

type AnyRow = Record<string, any>;

type FarmAlert = {
  id: string;
  category: '予定' | '分娩' | 'ワクチン' | 'BLV' | '治療' | '休薬';
  level: 'danger' | 'warning' | 'info';
  date?: string;
  title: string;
  target?: string;
  note?: string;
  link?: string;
  days?: number | null;
};

function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysLabel(days: number | null | undefined) {
  if (days === null || days === undefined) return '';
  if (days === 0) return '今日';
  if (days < 0) return `${Math.abs(days)}日超過`;
  return `あと${days}日`;
}

function isDate(value: unknown) {
  if (!value) return false;
  return !Number.isNaN(new Date(String(value)).getTime());
}

function severity(level: FarmAlert['level']) {
  if (level === 'danger') return 'error';
  if (level === 'warning') return 'warning';
  return 'info';
}

function levelLabel(level: FarmAlert['level']) {
  if (level === 'danger') return '要対応';
  if (level === 'warning') return '注意';
  return '確認';
}

export function AlertPage() {
  const [alerts, setAlerts] = useState<FarmAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [scheduleData, breedingData, vaccineData, blvData, treatmentData] = await Promise.all([
        getScheduleList().catch(() => []),
        getBreedingList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => []),
        getTreatmentList().catch(() => [])
      ]);

      const result: FarmAlert[] = [];

      for (const row of scheduleData as AnyRow[]) {
        if (row.status === '完了' || !isDate(row.dueDate)) continue;
        const days = daysUntil(row.dueDate);
        if (days !== null && days <= 14) {
          result.push({
            id: `schedule-${row.id}`,
            category: '予定',
            level: days < 0 ? 'danger' : days <= 3 ? 'warning' : 'info',
            date: row.dueDate,
            title: row.title || row.scheduleType || '予定',
            target: row.targetName || row.targetNumber || '',
            note: row.scheduleType || '',
            link: '/schedules',
            days
          });
        }
      }

      for (const row of breedingData as AnyRow[]) {
        if (!isDate(row.expectedCalvingDate)) continue;
        const days = daysUntil(row.expectedCalvingDate);
        if (days !== null && days >= -7 && days <= 60) {
          result.push({
            id: `breeding-${row.id}`,
            category: '分娩',
            level: days < 0 ? 'danger' : days <= 14 ? 'warning' : 'info',
            date: row.expectedCalvingDate,
            title: '分娩予定',
            target: row.cowName || row.cowEarTag || '',
            note: row.pregnancyResult || '',
            link: '/breedings',
            days
          });
        }
      }

      for (const row of vaccineData as AnyRow[]) {
        if (row.status === '接種済み' || !isDate(row.nextDueDate)) continue;
        const days = daysUntil(row.nextDueDate);
        if (days !== null && days <= 30) {
          result.push({
            id: `vaccine-${row.id}`,
            category: 'ワクチン',
            level: days < 0 ? 'danger' : days <= 7 ? 'warning' : 'info',
            date: row.nextDueDate,
            title: row.vaccineName || 'ワクチン予定',
            target: row.targetName || row.targetNumber || '',
            note: row.status || '',
            link: '/vaccines',
            days
          });
        }
      }

      for (const row of blvData as AnyRow[]) {
        if (!isDate(row.nextTestDate)) continue;
        const days = daysUntil(row.nextTestDate);
        if (days !== null && days <= 60) {
          result.push({
            id: `blv-${row.id}`,
            category: 'BLV',
            level: days < 0 ? 'danger' : days <= 14 ? 'warning' : 'info',
            date: row.nextTestDate,
            title: 'BLV次回検査',
            target: row.cowName || row.cowEarTag || '',
            note: row.result || '',
            link: '/blv',
            days
          });
        }
      }

      for (const row of treatmentData as AnyRow[]) {
        if (row.progress === '治療中' || row.progress === '要再診') {
          result.push({
            id: `treatment-${row.id}`,
            category: '治療',
            level: row.progress === '要再診' ? 'danger' : 'warning',
            date: row.treatmentDate,
            title: row.progress || '治療中',
            target: row.targetName || row.targetNumber || '',
            note: row.symptom || row.medicine || '',
            link: '/treatments',
            days: row.treatmentDate ? daysUntil(row.treatmentDate) : null
          });
        }

        if (isDate(row.withdrawalEndDate)) {
          const days = daysUntil(row.withdrawalEndDate);
          if (days !== null && days >= 0) {
            result.push({
              id: `withdrawal-${row.id}`,
              category: '休薬',
              level: days <= 3 ? 'warning' : 'info',
              date: row.withdrawalEndDate,
              title: '休薬期間中',
              target: row.targetName || row.targetNumber || '',
              note: row.medicine || '',
              link: '/treatments',
              days
            });
          }
        }
      }

      result.sort((a, b) => {
        const levelOrder = { danger: 0, warning: 1, info: 2 };
        const levelDiff = levelOrder[a.level] - levelOrder[b.level];
        if (levelDiff !== 0) return levelDiff;
        return String(a.date || '').localeCompare(String(b.date || ''));
      });

      setAlerts(result);
      setLoading(false);
    }

    load();
  }, []);

  const counts = useMemo(() => {
    return {
      all: alerts.length,
      danger: alerts.filter((item) => item.level === 'danger').length,
      warning: alerts.filter((item) => item.level === 'warning').length,
      info: alerts.filter((item) => item.level === 'info').length
    };
  }, [alerts]);

  const sections = [
    { title: '要対応', level: 'danger' as const, empty: '期限切れ・要対応のアラートはありません。' },
    { title: '注意', level: 'warning' as const, empty: '注意が必要なアラートはありません。' },
    { title: '確認', level: 'info' as const, empty: '確認アラートはありません。' }
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800}>今日の確認・アラート</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Alert severity="info">
        今日見るべき予定、分娩予定、ワクチン、BLV、治療中、休薬中をまとめて確認します。対応が必要なものから順番に表示します。
      </Alert>

      {loading && <Alert severity="info">アラートを読み込み中です...</Alert>}

      <Grid container spacing={2}>
        <Grid item xs={6} sm={3}>
          <Card><CardContent><Typography color="text.secondary">全体</Typography><Typography variant="h5" fontWeight={800}>{counts.all}件</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent><Typography color="text.secondary">要対応</Typography><Typography variant="h5" fontWeight={800}>{counts.danger}件</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent><Typography color="text.secondary">注意</Typography><Typography variant="h5" fontWeight={800}>{counts.warning}件</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card><CardContent><Typography color="text.secondary">確認</Typography><Typography variant="h5" fontWeight={800}>{counts.info}件</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>確認が必要なもの</Typography>
            <Typography color="text.secondary">
              要対応は早めに確認します。注意・確認は内容を見て、必要な場合は「関連画面を開く」から詳しい画面へ進みます。
            </Typography>

            {counts.all === 0 && (
              <Alert severity="success">現在、注意が必要なアラートはありません。</Alert>
            )}

            {sections.map((section) => {
              const sectionAlerts = alerts.filter((item) => item.level === section.level);

              return (
                <Stack spacing={1} key={section.level}>
                  <Divider />
                  <Typography variant="h6" fontWeight={800}>{section.title}</Typography>

                  {sectionAlerts.length === 0 ? (
                    <Typography color="text.secondary">{section.empty}</Typography>
                  ) : (
                    sectionAlerts.map((item) => (
                      <Alert key={item.id} severity={severity(item.level) as any}>
                        <Stack spacing={0.5}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Chip size="small" label={item.category} />
                            <Chip size="small" label={levelLabel(item.level)} />
                            {item.date && <Chip size="small" label={item.date} />}
                            {item.days !== null && item.days !== undefined && <Chip size="small" label={daysLabel(item.days)} />}
                          </Stack>

                          <Typography fontWeight={800}>
                            {item.target ? `${item.target} / ` : ''}{item.title}
                          </Typography>

                          {item.note && (
                            <Typography variant="body2">{item.note}</Typography>
                          )}

                          {item.link && (
                            <Button component={RouterLink} to={item.link} variant="outlined" size="small" className="no-print">
                              関連画面を開く
                            </Button>
                          )}
                        </Stack>
                      </Alert>
                    ))
                  )}
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
