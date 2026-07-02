import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { getScheduleList } from '../services/scheduleApi';
import { getBreedingList } from '../services/breedingApi';
import { getVaccineList } from '../services/vaccineApi';
import { getBlvTestList } from '../services/blvApi';

type AnyRow = Record<string, any>;

type CalendarEvent = {
  id: string;
  date: string;
  type: '予定' | '分娩' | 'ワクチン' | 'BLV';
  title: string;
  target?: string;
  status?: string;
};

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidDateString(value: unknown) {
  if (!value) return false;
  const date = new Date(String(value));
  return !Number.isNaN(date.getTime());
}

function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const days: Date[] = [];

  for (let i = 0; i < startDay; i += 1) {
    days.push(new Date(year, month, 1 - (startDay - i)));
  }

  for (let d = 1; d <= last.getDate(); d += 1) {
    days.push(new Date(year, month, d));
  }

  while (days.length % 7 !== 0) {
    const next = new Date(days[days.length - 1]);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }

  return days;
}

function typeColor(type: CalendarEvent['type']) {
  if (type === '分娩') return 'warning';
  if (type === 'ワクチン') return 'info';
  if (type === 'BLV') return 'success';
  return 'default';
}

export function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [scheduleData, breedingData, vaccineData, blvData] = await Promise.all([
        getScheduleList().catch(() => []),
        getBreedingList().catch(() => []),
        getVaccineList().catch(() => []),
        getBlvTestList().catch(() => [])
      ]);

      const scheduleEvents: CalendarEvent[] = (scheduleData as AnyRow[])
        .filter((row) => isValidDateString(row.dueDate))
        .map((row) => ({
          id: `schedule-${row.id}`,
          date: row.dueDate,
          type: '予定',
          title: row.title || row.scheduleType || '予定',
          target: row.targetName || row.targetNumber || '',
          status: row.status || ''
        }));

      const calvingEvents: CalendarEvent[] = (breedingData as AnyRow[])
        .filter((row) => isValidDateString(row.expectedCalvingDate))
        .map((row) => ({
          id: `breeding-${row.id}`,
          date: row.expectedCalvingDate,
          type: '分娩',
          title: '分娩予定',
          target: row.cowName || row.cowEarTag || '',
          status: row.pregnancyResult || ''
        }));

      const vaccineEvents: CalendarEvent[] = (vaccineData as AnyRow[])
        .filter((row) => row.status !== '接種済み' && isValidDateString(row.nextDueDate))
        .map((row) => ({
          id: `vaccine-${row.id}`,
          date: row.nextDueDate,
          type: 'ワクチン',
          title: row.vaccineName || 'ワクチン予定',
          target: row.targetName || row.targetNumber || '',
          status: row.status || ''
        }));

      const blvEvents: CalendarEvent[] = (blvData as AnyRow[])
        .filter((row) => isValidDateString(row.nextTestDate))
        .map((row) => ({
          id: `blv-${row.id}`,
          date: row.nextTestDate,
          type: 'BLV',
          title: 'BLV検査',
          target: row.cowName || row.cowEarTag || '',
          status: row.result || ''
        }));

      setEvents([...scheduleEvents, ...calvingEvents, ...vaccineEvents, ...blvEvents]);
      setLoading(false);
    }

    load();
  }, []);

  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) || [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const monthEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return events
      .filter((event) => event.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, year, month]);

  const moveMonth = (diff: number) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + diff, 1));
  };

  const todayKey = toDateKey(today);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" className="no-print">
        <Typography variant="h5" fontWeight={800}>月間カレンダー</Typography>
        <Button variant="contained" onClick={() => window.print()}>印刷する</Button>
      </Stack>

      <Card className="no-print">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Button variant="outlined" onClick={() => moveMonth(-1)}>前月</Button>
            <Typography variant="h6" fontWeight={800}>
              {year}年 {month + 1}月
            </Typography>
            <Button variant="outlined" onClick={() => moveMonth(1)}>翌月</Button>
          </Stack>
        </CardContent>
      </Card>

      {loading && <Alert severity="info">カレンダーを読み込み中です...</Alert>}

      <Card className="print-card">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>
              {year}年 {month + 1}月の予定
            </Typography>

            <Grid container spacing={0.5}>
              {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
                <Grid item xs={12 / 7} key={label}>
                  <Typography align="center" fontWeight={800}>{label}</Typography>
                </Grid>
              ))}

              {days.map((day) => {
                const key = toDateKey(day);
                const dayEvents = eventsByDate.get(key) || [];
                const isCurrentMonth = day.getMonth() === month;
                const isToday = key === todayKey;

                return (
                  <Grid item xs={12 / 7} key={key}>
                    <Card variant="outlined" sx={{
                      minHeight: 115,
                      opacity: isCurrentMonth ? 1 : 0.35,
                      borderWidth: isToday ? 2 : 1
                    }}>
                      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                        <Stack spacing={0.5}>
                          <Typography fontWeight={isToday ? 800 : 600}>
                            {day.getDate()}
                            {isToday ? ' 今日' : ''}
                          </Typography>

                          {dayEvents.slice(0, 4).map((event) => (
                            <Chip
                              key={event.id}
                              size="small"
                              color={typeColor(event.type) as any}
                              label={`${event.type}: ${event.target ? event.target + ' ' : ''}${event.title}`}
                              sx={{ justifyContent: 'flex-start', maxWidth: '100%' }}
                            />
                          ))}

                          {dayEvents.length > 4 && (
                            <Typography variant="caption" color="text.secondary">
                              他{dayEvents.length - 4}件
                            </Typography>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={800}>今月の予定一覧</Typography>
            {monthEvents.length === 0 ? (
              <Typography color="text.secondary">今月の予定はありません。</Typography>
            ) : (
              monthEvents.map((event) => (
                <Alert key={event.id} severity="info">
                  {event.date} / {event.type} / {event.target ? `${event.target} / ` : ''}{event.title}
                  {event.status ? ` / ${event.status}` : ''}
                </Alert>
              ))
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
