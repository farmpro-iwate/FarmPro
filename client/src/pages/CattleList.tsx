import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { backfillMissingCattleToCloud, deleteCattle, getCattleList, previewCattleCloudBackfill, pullNewerCattleRecordsFromCloud } from '../services/api';
import { backfillCattleRecordsToSyncStore, previewCattleRecordBackfill } from '../services/cattleRecordBackfill';
import { getBreedingList } from '../services/breedingApi';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { formatSex } from '../utils/sex';

type CattleRow = {
  id: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday?: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  stage?: '育成牛' | '繁殖牛';
  note?: string;
};

type AnyRow = Record<string, any>;

type AttentionItem = {
  label: '次回発情確認' | '妊娠鑑定' | '再鑑定' | '分娩予定' | '増し飼い検討';
  date: string;
  urgent: boolean;
};

type CloudCheckResult = {
  missing: number;
  matched: number;
  conflicts: number;
};

function includesText(value: unknown, keyword: string) {
  return String(value ?? '').toLowerCase().includes(keyword.toLowerCase());
}

function dateOnly(value: unknown) {
  return value ? String(value).slice(0, 10) : '';
}

function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

function sameCow(row: AnyRow, cattle: CattleRow) {
  return String(row.cowEarTag || '') === String(cattle.earTag || '') ||
    (row.cowName && cattle.name && String(row.cowName) === String(cattle.name));
}

function attentionItemsFor(cattle: CattleRow, breedings: AnyRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  breedings.filter((row) => sameCow(row, cattle)).forEach((row) => {
    const pregnancyResult = String(row.pregnancyResult || '未鑑定');
    const breedingStatus = String(row.breedingStatus || '');
    const isCalved = breedingStatus === '分娩済み';
    const isPregnant = ['受胎', '妊娠'].includes(pregnancyResult);
    const isEmpty = ['空胎', '不受胎'].includes(pregnancyResult);
    const needsRecheck = pregnancyResult === '再鑑定予定';
    const hasPregnancyCheck = Boolean(dateOnly(row.pregnancyCheckDate || row.pregnancyDiagnosisDate));

    if (isCalved) return;

    if (!isPregnant && !needsRecheck && !hasPregnancyCheck) {
      const date = dateOnly(row.pregnancyCheckExpectedDate);
      const days = daysUntil(date);
      if (date && days !== null && days >= -7 && days <= 14) {
        items.push({ label: '妊娠鑑定', date, urgent: days <= 3 });
      }
    }

    if (isEmpty) {
      const date = dateOnly(row.nextHeatExpectedDate);
      const days = daysUntil(date);
      if (date && days !== null && days >= -7 && days <= 14) {
        items.push({ label: '次回発情確認', date, urgent: days <= 3 });
      }
    }

    if (needsRecheck) {
      const date = dateOnly(row.recheckExpectedDate);
      const days = daysUntil(date);
      if (date && days !== null && days >= -7 && days <= 14) {
        items.push({ label: '再鑑定', date, urgent: days <= 3 });
      }
    }

    if (isPregnant) {
      const date = dateOnly(row.expectedCalvingDate);
      const days = daysUntil(date);
      if (date && days !== null) {
        if (days >= -7 && days <= 60) items.push({ label: '分娩予定', date, urgent: days <= 14 });
        if (days <= 60) items.push({ label: '増し飼い検討', date, urgent: days <= 14 });
      }
    }
  });

  const unique = new Map<string, AttentionItem>();
  items.forEach((item) => unique.set(`${item.label}-${item.date}`, item));
  return Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function CattleList() {
  const [rows, setRows] = useState<CattleRow[]>([]);
  const [breedings, setBreedings] = useState<AnyRow[]>([]);
  const [search, setSearch] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('すべて');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cloudCheckRunning, setCloudCheckRunning] = useState(false);
  const [cloudCheckResult, setCloudCheckResult] = useState<CloudCheckResult | null>(null);
  const [cloudCheckError, setCloudCheckError] = useState('');
  const [cloudBackfillRunning, setCloudBackfillRunning] = useState(false);
  const [cloudBackfillMessage, setCloudBackfillMessage] = useState('');
  const [migrationCheckRunning, setMigrationCheckRunning] = useState(false);
  const [migrationCheckResult, setMigrationCheckResult] = useState<CloudCheckResult | null>(null);
  const [migrationCheckError, setMigrationCheckError] = useState('');
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');

  const load = async () => {
    const [cattleData, breedingData] = await Promise.all([
      getCattleList(),
      getBreedingList().catch(() => []),
    ]);
    setRows(cattleData as CattleRow[]);
    setBreedings(breedingData as AnyRow[]);
  };

  useEffect(() => {
    let active = true;

    const loadWithSafeCloudPull = async () => {
      const plan = getFarmProPlan(getCurrentFarmProPlanId());
      if (plan.multiDeviceSync) {
        try {
          await pullNewerCattleRecordsFromCloud();
        } catch (error) {
          console.warn('牛台帳のクラウド取り込みをスキップしました。', error);
        }
      }
      if (active) await load();
    };

    void loadWithSafeCloudPull();
    return () => {
      active = false;
    };
  }, []);

  const handleCloudCheck = async () => {
    setCloudCheckRunning(true);
    setCloudCheckResult(null);
    setCloudCheckError('');
    setCloudBackfillMessage('');
    try {
      const preview = await previewCattleCloudBackfill();
      setCloudCheckResult({
        missing: preview.missing.length,
        matched: preview.matched.length,
        conflicts: preview.conflicts.length,
      });
    } catch (error) {
      setCloudCheckError(error instanceof Error ? error.message : 'クラウド確認に失敗しました。');
    } finally {
      setCloudCheckRunning(false);
    }
  };

  const handleCloudBackfill = async () => {
    if (!cloudCheckResult || cloudCheckResult.missing <= 0 || cloudCheckResult.conflicts > 0) return;
    if (!confirm(`クラウド未登録の牛${cloudCheckResult.missing}件だけを補完します。よろしいですか？`)) return;

    setCloudBackfillRunning(true);
    setCloudCheckError('');
    setCloudBackfillMessage('');
    try {
      const result = await backfillMissingCattleToCloud();
      setCloudCheckResult({
        missing: result.missingAfter,
        matched: result.matchedAfter,
        conflicts: result.conflictsAfter,
      });
      setCloudBackfillMessage(`クラウドへ${result.uploaded}件補完しました。`);
    } catch (error) {
      setCloudCheckError(error instanceof Error ? error.message : 'クラウド補完に失敗しました。');
    } finally {
      setCloudBackfillRunning(false);
    }
  };

  const handleMigrationCheck = async () => {
    setMigrationCheckRunning(true);
    setMigrationCheckResult(null);
    setMigrationCheckError('');
    setMigrationMessage('');
    try {
      const preview = await previewCattleRecordBackfill();
      setMigrationCheckResult({
        missing: preview.missing.length,
        matched: preview.matched.length,
        conflicts: preview.conflicts.length,
      });
    } catch (error) {
      setMigrationCheckError(error instanceof Error ? error.message : '新同期ストアの確認に失敗しました。');
    } finally {
      setMigrationCheckRunning(false);
    }
  };

  const handleMigration = async () => {
    if (!migrationCheckResult || migrationCheckResult.missing <= 0 || migrationCheckResult.conflicts > 0) return;
    if (!confirm(`新同期ストア未登録の牛${migrationCheckResult.missing}件だけを移行します。よろしいですか？`)) return;

    setMigrationRunning(true);
    setMigrationCheckError('');
    setMigrationMessage('');
    try {
      const result = await backfillCattleRecordsToSyncStore();
      setMigrationCheckResult({
        missing: result.missingAfter,
        matched: result.matchedAfter,
        conflicts: result.conflictsAfter,
      });
      setMigrationMessage(`新同期ストアへ${result.uploaded}件移行しました。`);
      await load();
    } catch (error) {
      setMigrationCheckError(error instanceof Error ? error.message : '新同期ストアへの移行に失敗しました。');
    } finally {
      setMigrationRunning(false);
    }
  };

  const attentionMap = useMemo(() => {
    const map = new Map<number, AttentionItem[]>();
    rows.forEach((row) => map.set(row.id, attentionItemsFor(row, breedings)));
    return map;
  }, [rows, breedings]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const keywordOk = !search || [
        row.earTag,
        row.identificationNumber,
        row.name,
        row.birthday,
        row.sex,
        row.sire,
        row.dam,
        row.stage,
        row.note,
      ].some((value) => includesText(value, search));

      const hasAttention = (attentionMap.get(row.id) || []).length > 0;
      const attentionOk = attentionFilter === 'すべて' || hasAttention;
      return keywordOk && attentionOk;
    });
  }, [rows, search, attentionFilter, attentionMap]);

  const handleDelete = async (id: number) => {
    if (!confirm('削除しますか？')) return;
    await deleteCattle(id);
    await load();
  };

  const clearFilters = () => {
    setSearch('');
    setAttentionFilter('すべて');
  };

  const hasFilters = Boolean(search || attentionFilter !== 'すべて');
  const canBackfill = Boolean(cloudCheckResult && cloudCheckResult.missing > 0 && cloudCheckResult.conflicts === 0);
  const canMigrate = Boolean(migrationCheckResult && migrationCheckResult.missing > 0 && migrationCheckResult.conflicts === 0);

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="h5" fontWeight={800}>繁殖牛台帳</Typography>
          <Typography color="text.secondary">表示：{filteredRows.length}件 / 全{rows.length}件</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? '検索を閉じる' : hasFilters ? '検索・絞り込み中' : '検索・絞り込み'}
          </Button>
          <Button component={RouterLink} to="/cattle/new" variant="contained">新規登録</Button>
        </Stack>
      </Stack>

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700}>新同期ストアへの移行</Typography>
            <Typography color="text.secondary" variant="body2">まず安全確認し、衝突がない場合だけ未登録分を移行します。</Typography>
            <Button variant="outlined" onClick={handleMigrationCheck} disabled={migrationCheckRunning || migrationRunning}>
              {migrationCheckRunning ? '確認中…' : '移行前の安全確認'}
            </Button>
            {migrationCheckResult && (
              <Alert severity={migrationCheckResult.conflicts > 0 ? 'warning' : 'info'}>
                新同期ストア未登録：{migrationCheckResult.missing}件 / 一致：{migrationCheckResult.matched}件 / 衝突：{migrationCheckResult.conflicts}件
              </Alert>
            )}
            {canMigrate && (
              <Button variant="contained" onClick={handleMigration} disabled={migrationRunning}>
                {migrationRunning ? '移行中…' : `未登録${migrationCheckResult?.missing ?? 0}件を新同期ストアへ移行`}
              </Button>
            )}
            {migrationCheckResult && migrationCheckResult.conflicts > 0 && (
              <Alert severity="warning">衝突があるため、移行処理は実行しません。</Alert>
            )}
            {migrationMessage && <Alert severity="success">{migrationMessage}</Alert>}
            {migrationCheckError && <Alert severity="error">{migrationCheckError}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ py: 1.5 }}>
          <Stack spacing={1}>
            <Typography fontWeight={700}>クラウド登録状況の確認</Typography>
            <Typography color="text.secondary" variant="body2">牛データは変更せず、PC内とクラウドの件数・衝突を確認します。</Typography>
            <Button variant="outlined" onClick={handleCloudCheck} disabled={cloudCheckRunning || cloudBackfillRunning}>
              {cloudCheckRunning ? '確認中…' : 'クラウド登録状況を確認'}
            </Button>
            {cloudCheckResult && (
              <Alert severity={cloudCheckResult.conflicts > 0 ? 'warning' : 'info'}>
                クラウド未登録：{cloudCheckResult.missing}件 / 一致：{cloudCheckResult.matched}件 / 衝突：{cloudCheckResult.conflicts}件
              </Alert>
            )}
            {canBackfill && (
              <Button variant="contained" onClick={handleCloudBackfill} disabled={cloudBackfillRunning}>
                {cloudBackfillRunning ? '補完中…' : `未登録${cloudCheckResult?.missing ?? 0}件をクラウドへ補完`}
              </Button>
            )}
            {cloudCheckResult && cloudCheckResult.conflicts > 0 && (
              <Alert severity="warning">衝突があるため、クラウド補完は実行できません。</Alert>
            )}
            {cloudBackfillMessage && <Alert severity="success">{cloudBackfillMessage}</Alert>}
            {cloudCheckError && <Alert severity="error">{cloudCheckError}</Alert>}
          </Stack>
        </CardContent>
      </Card>

      {searchOpen && (
        <Card>
          <CardContent sx={{ py: 1.5 }}>
            <Stack spacing={1}>
              <Typography fontWeight={700} color="text.secondary">検索・絞り込み</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField
                  label="検索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="耳標番号、個体識別番号、名号など"
                />
                <TextField
                  label="要対応"
                  select
                  value={attentionFilter}
                  onChange={(e) => setAttentionFilter(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{ maxWidth: { sm: 180 } }}
                >
                  <MenuItem value="すべて">すべて</MenuItem>
                  <MenuItem value="要対応のみ">要対応のみ</MenuItem>
                </TextField>
                <Button variant="outlined" onClick={clearFilters} size="small">クリア</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      {filteredRows.map((row) => {
        const attentionItems = attentionMap.get(row.id) || [];
        return (
          <Card key={row.id}>
            <CardContent>
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6" fontWeight={800}>{row.name}</Typography>
                  <Chip label={row.stage || '繁殖牛'} size="small" color={row.stage === '育成牛' ? 'info' : 'success'} />
                </Stack>

                {attentionItems.length > 0 && (
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {attentionItems.map((item) => (
                      <Chip key={`${item.label}-${item.date}`} label={`${item.label} ${item.date}`} size="small" color={item.urgent ? 'warning' : 'info'} />
                    ))}
                  </Stack>
                )}

                <Typography>耳標番号：{row.earTag || '-'}</Typography>
                <Typography color="text.secondary">個体識別番号：{row.identificationNumber || '-'}</Typography>
                <Typography color="text.secondary">生年月日：{row.birthday || '-'}</Typography>
                <Typography color="text.secondary">性別：{formatSex(row.sex)}</Typography>
                <Typography color="text.secondary">父牛：{row.sire || '-'} / 母牛：{row.dam || '-'}</Typography>
                {row.note && <Typography color="text.secondary">備考：{row.note}</Typography>}

                <Divider />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                  <Button component={RouterLink} to={`/cattle/${row.id}`} variant="contained" fullWidth>個体カルテ</Button>
                  <Button component={RouterLink} to={`/cattle/${row.id}/edit`} variant="outlined" fullWidth>編集</Button>
                  <Button color="error" variant="outlined" onClick={() => handleDelete(row.id)} fullWidth>削除</Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}

      {filteredRows.length === 0 && (
        <Card>
          <CardContent>
            <Typography color="text.secondary">該当する牛がありません。</Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}