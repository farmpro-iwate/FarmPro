import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import type { Calf } from '../types/calf';
import { getAllRecords } from '../storage/repository';
import { formatTemporaryCalfNumber } from '../utils/temporaryCalfNumber';

function value(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function ageDaysFromBirthday(birthday?: string) {
  if (!birthday) return null;
  const birth = new Date(birthday);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  return Math.max(0, Math.floor((today.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24)));
}

function calfLabel(calf: Calf) {
  const earTag = String(calf.calfNumber || '').trim();
  if (earTag && !earTag.startsWith('TEMP-')) return earTag;
  return formatTemporaryCalfNumber(calf.temporaryCalfNumber || earTag || '');
}

export function CalfManagementPage() {
  const [calves, setCalves] = useState<Calf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const rows = await getAllRecords<Calf>('calves');
        if (!cancelled) setCalves(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '子牛情報を取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCalves = useMemo(
    () => calves.filter((calf) => !['販売済み', '牛台帳へ移行済み', '死亡・その他'].includes(String(calf.managementStatus || ''))),
    [calves],
  );

  return (
    <Stack spacing={2}>
      <Stack spacing={0.4}>
        <Typography variant="h5" fontWeight={900}>子牛管理</Typography>
        <Typography color="text.secondary">
          子牛台帳とは分けて、育て方・離乳・成長の管理を行う画面です。
        </Typography>
      </Stack>

      <Alert severity="info">
        離乳は、人工哺育（ミルク哺育）からの離乳と、自然哺育で母牛から離す離乳の両方をここで管理します。
      </Alert>

      {loading && <Typography>読み込み中...</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {!loading && !error && activeCalves.length === 0 && (
        <Alert severity="success">管理中の子牛はありません。</Alert>
      )}

      {!loading && !error && activeCalves.length > 0 && (
        <Grid container spacing={1.5}>
          {activeCalves.map((calf) => {
            const ageDays = ageDaysFromBirthday(calf.birthday);
            return (
              <Grid item xs={12} sm={6} lg={4} key={calf.id}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack spacing={1.25}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Stack spacing={0.2}>
                          <Typography fontWeight={900} fontSize="1.05rem">
                            {calfLabel(calf)}{calf.name ? ` ${calf.name}` : ''}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {ageDays === null ? '日齢 -' : `日齢 ${ageDays}日`} / 母牛 {value(calf.motherName || calf.motherCowName)}
                          </Typography>
                        </Stack>
                        <Chip
                          size="small"
                          color={calf.weaningStatus === '離乳済み' ? 'success' : 'warning'}
                          label={value(calf.weaningStatus || '離乳前')}
                        />
                      </Stack>

                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        <Chip size="small" variant="outlined" label={`哺育：${value(calf.feedingMethod)}`} />
                        {calf.weaningPlannedDate && (
                          <Chip size="small" variant="outlined" label={`離乳予定：${calf.weaningPlannedDate}`} />
                        )}
                        {calf.weaningDate && (
                          <Chip size="small" variant="outlined" label={`離乳日：${calf.weaningDate}`} />
                        )}
                      </Stack>

                      <Button
                        component={RouterLink}
                        to={`/calves/${calf.id}/edit`}
                        variant="contained"
                        fullWidth
                      >
                        哺育・離乳を確認する
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
