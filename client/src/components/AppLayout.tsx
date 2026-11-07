import { MouseEvent, ReactNode, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, IconButton, ListSubheader, Menu, MenuItem, Stack, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { canRetryUnsentExpensesOnPage, retryUnsentExpenses } from '../services/expensesApi';
import { retryPendingCattleSync } from '../services/api';
import { retryPendingCalfSync } from '../services/calfApi';
import { ANIMAL_SYNC_STATUS_EVENT, assertAnimalSyncContext, canRetryAnimalSyncOnPage, getAnimalSyncContext } from '../services/animalRecordSyncSafety';
import { VACCINE_SYNC_STATUS_EVENT, assertVaccineSyncContext, canRetryVaccineSyncOnPage, getVaccineSyncContext, retryPendingVaccineSync } from '../services/vaccineApi';
import { TREATMENT_SYNC_STATUS_EVENT, assertTreatmentSyncContext, getTreatmentSyncContext, retryPendingTreatmentSync } from '../services/treatmentApi';
import { BREEDING_SYNC_STATUS_EVENT, assertBreedingSyncContext, getBreedingSyncContext, retryPendingBreedingSync } from '../services/breedingApi';
import { BLV_SYNC_STATUS_EVENT, assertBlvSyncContext, getBlvSyncContext, retryPendingBlvSync } from '../services/blvApi';
import { FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT, assertFeedingAlertActionSyncContext, getFeedingAlertActionSyncContext, retryPendingFeedingAlertActionSync } from '../services/feedingAlertActionsApi';
import { FATTENING_TRANSITION_SYNC_STATUS_EVENT, assertFatteningTransitionSyncContext, getFatteningTransitionSyncContext, retryPendingFatteningTransitionSync } from '../services/fatteningTransitionsApi';
import { canRetryRecordSyncOnPage } from '../services/recordSyncRetry';
import { ACTIVITY_RECORD_SYNC_STATUS_EVENT, assertActivityRecordSyncContext, getActivityRecordSyncContext, retryPendingActivityRecordSync } from '../services/activityRecordsApi';

type Props = { children: ReactNode };
type NavItem = { label: string; path: string };
type NavGroup = { label: string; items: NavItem[] };

function isActiveNavItem(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  if (itemPath === '/analysis' && currentPath === '/reports') return true;
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [activityAnchor, setActivityAnchor] = useState<null | HTMLElement>(null);
  const [isOperator, setIsOperator] = useState(false);
  const authUser = getStoredAuthUser();
  const authToken = getAuthToken();
  const planLabel = authUser?.plan === 'pro'
    ? 'Pro / クラウド対応'
    : authUser?.plan === 'standard'
      ? 'Standard / クラウド対応'
      : 'Free / この端末内に保存';

  useEffect(() => {
    if (!canRetryUnsentExpensesOnPage(location.pathname)) return;
    let active = true;
    const retry = () => {
      if (!active || document.visibilityState === 'hidden') return;
      void retryUnsentExpenses().catch(() => { /* Pending records remain on this device. */ });
    };
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);
    retry();
    return () => {
      active = false;
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [location.pathname, authUser?.farmId, authUser?.id, authUser?.plan]);

  useEffect(() => {
    if (!canRetryVaccineSyncOnPage(location.pathname)) return;
    const context = getVaccineSyncContext();
    if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
    let active = true;
    let running = false;
    let requestedAgain = false;
    const canRun = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const retry = async () => {
      if (!canRun()) return;
      if (running) { requestedAgain = true; return; }
      running = true;
      try {
        do {
          requestedAgain = false;
          assertVaccineSyncContext(context);
          const changed = await retryPendingVaccineSync();
          assertVaccineSyncContext(context);
          if (active && changed > 0) window.dispatchEvent(new Event(VACCINE_SYNC_STATUS_EVENT));
        } while (requestedAgain && canRun());
      } catch {
        // A failed or interrupted retry leaves the record on its original device.
      } finally { running = false; }
    };
    const onResume = () => { void retry(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    onResume();
    return () => {
      active = false;
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [location.pathname, authUser?.farmId, authUser?.id, authUser?.plan, authToken]);

  useEffect(() => {
    const tasks = [
      { source: 'treatments' as const, context: getTreatmentSyncContext(), assertContext: assertTreatmentSyncContext,
        retry: retryPendingTreatmentSync, event: TREATMENT_SYNC_STATUS_EVENT },
      { source: 'breedings' as const, context: getBreedingSyncContext(), assertContext: assertBreedingSyncContext,
        retry: retryPendingBreedingSync, event: BREEDING_SYNC_STATUS_EVENT },
      { source: 'blvTests' as const, context: getBlvSyncContext(), assertContext: assertBlvSyncContext,
        retry: retryPendingBlvSync, event: BLV_SYNC_STATUS_EVENT },
      { source: 'feedingAlertActions' as const, context: getFeedingAlertActionSyncContext(), assertContext: assertFeedingAlertActionSyncContext,
        retry: retryPendingFeedingAlertActionSync, event: FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT },
      { source: 'fatteningTransitions' as const, context: getFatteningTransitionSyncContext(), assertContext: assertFatteningTransitionSyncContext,
        retry: retryPendingFatteningTransitionSync, event: FATTENING_TRANSITION_SYNC_STATUS_EVENT },
      { source: 'activityRecords' as const, context: getActivityRecordSyncContext(), assertContext: assertActivityRecordSyncContext,
        retry: retryPendingActivityRecordSync, event: ACTIVITY_RECORD_SYNC_STATUS_EVENT },
    ].filter(task => canRetryRecordSyncOnPage(task.source, location.pathname) &&
      task.context.cloudEnabled && task.context.token && task.context.farmId && task.context.userId);
    if (!tasks.length) return;
    let active = true;
    let running = false;
    let requestedAgain = false;
    const canRun = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const retry = async () => {
      if (!canRun()) return;
      if (running) { requestedAgain = true; return; }
      running = true;
      try {
        do {
          requestedAgain = false;
          tasks.forEach(task => task.assertContext(task.context));
          const results = await Promise.allSettled(tasks.map(async task => {
            task.assertContext(task.context);
            const changed = await task.retry();
            task.assertContext(task.context);
            return changed;
          }));
          tasks.forEach(task => task.assertContext(task.context));
          if (canRun()) results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value > 0) {
              window.dispatchEvent(new Event(tasks[index].event));
            }
          });
        } while (requestedAgain && canRun());
      } catch {
        // Pending records remain on the original farm and browser.
      } finally { running = false; }
    };
    const onResume = () => { void retry(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    onResume();
    return () => {
      active = false;
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [location.pathname, authUser?.farmId, authUser?.id, authUser?.plan, authToken]);

  useEffect(() => {
    if (!canRetryAnimalSyncOnPage(location.pathname)) return;
    const context = getAnimalSyncContext();
    if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
    let active = true;
    let running = false;
    let requestedAgain = false;
    const canRun = () => active && document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const retry = async () => {
      if (!canRun()) return;
      if (running) { requestedAgain = true; return; }
      running = true;
      try {
        do {
          requestedAgain = false;
          const retryContext = getAnimalSyncContext();
          if (retryContext.farmId !== context.farmId || retryContext.userId !== context.userId ||
              retryContext.planId !== context.planId || !retryContext.cloudEnabled || !retryContext.token) return;
          const results = await Promise.allSettled([retryPendingCattleSync(), retryPendingCalfSync()]);
          assertAnimalSyncContext(retryContext);
          if (active && results.some(result => result.status === 'fulfilled' && result.value > 0)) {
            window.dispatchEvent(new Event(ANIMAL_SYNC_STATUS_EVENT));
          }
        } while (requestedAgain && canRun());
      } catch {
        // The pending records stay on their original farm and browser.
      } finally { running = false; }
    };
    const onResume = () => { void retry(); };
    const onVisible = () => { if (document.visibilityState === 'visible') onResume(); };
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onVisible);
    onResume();
    return () => {
      active = false;
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [location.pathname, authUser?.farmId, authUser?.id, authUser?.plan]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setIsOperator(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/operator/access?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ operator?: boolean }>;
      })
      .then((data) => {
        if (!cancelled) setIsOperator(Boolean(data?.operator));
      })
      .catch(() => {
        if (!cancelled) setIsOperator(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  const isAnimalDetailPage =
    /^\/cattle\/[^/]+$/.test(location.pathname) ||
    /^\/calves\/[^/]+$/.test(location.pathname);
  const aiAskPath = isAnimalDetailPage
    ? `/ai-help?from=${encodeURIComponent(location.pathname)}`
    : '/ai-help';
  const handleAiAskClick = (event: MouseEvent<HTMLElement>) => {
    const params = new URLSearchParams(location.search);
    if (location.pathname !== '/ai-help' || params.get('mode') === 'record') return;

    event.preventDefault();
    window.dispatchEvent(new Event('farmpro:ai-help-new-question'));
  };

  const primaryItems: NavItem[] = [
    { label: 'ホーム', path: '/' },
    { label: '予定', path: '/schedules' },
    { label: '分析', path: '/analysis' },
  ];

  const otherGroups: NavGroup[] = [
    {
      label: '予定・入力補助',
      items: [
        { label: 'カレンダー', path: '/calendar' },
        { label: 'AIで記録', path: '/ai-help?mode=record' },
        { label: 'AI相談', path: aiAskPath },
      ],
    },
    {
      label: '牛・繁殖',
      items: [
        { label: '繁殖牛台帳', path: '/cattle' },
        { label: '育成牛台帳', path: '/cattle/growing' },
        { label: '子牛台帳', path: '/calves' },
        { label: '繁殖管理', path: '/breedings' },
        { label: '分娩記録', path: '/calvings' },
        { label: '活動記録', path: '/activities' },
        { label: 'アラート', path: '/alerts' },
      ],
    },
    {
      label: '健康・飼養',
      items: [
        { label: '治療・投薬履歴', path: '/treatments' },
        { label: 'ワクチン', path: '/vaccines' },
        { label: 'BLV管理', path: '/blv' },
        { label: '飼養管理', path: '/feedings' },
        { label: '給与目安', path: '/feeding-guide' },
        { label: '飼料在庫', path: '/feed-inventory' },
        { label: '医薬品在庫', path: '/supply-inventory?kind=' + encodeURIComponent('医薬品') },
        { label: '受精卵在庫', path: '/supply-inventory?kind=' + encodeURIComponent('受精卵') },
      ],
    },
    {
      label: '販売・経営',
      items: [
        { label: '市場出荷予定', path: '/market-shipping-plan' },
        { label: '出荷販売', path: '/sales' },
        { label: '販売済み牛一覧', path: '/cattle/sold' },
        { label: '経費管理', path: '/expenses' },
        { label: '月別収支', path: '/monthly-balance' },
      ],
    },
    {
      label: '分析',
      items: [
        { label: '農場全体の成績', path: '/analysis?scope=farm' },
        { label: '母牛ごとの成績比較', path: '/analysis?scope=mothers' },
        { label: '経営分析', path: '/reports' },
      ],
    },
    {
      label: 'データ・設定',
      items: [
        { label: '過去データ入力', path: '/past-data-entry' },
        { label: '牛情報を取り込む', path: '/animal-import' },
        { label: 'マスター登録', path: '/masters' },
        { label: 'バックアップ', path: '/backups' },
        { label: '複数端末同期', path: '/device-sync' },
        { label: '印刷', path: '/print' },
        { label: '設定', path: '/settings' },
        { label: '有料プラン申込', path: '/paid-plan' },
        { label: 'ヘルプ', path: '/help' },
        { label: 'ログアウト', path: '/logout' },
      ],
    },
    {
      label: '規約・法定情報',
      items: [
        { label: '利用規約', path: '/terms' },
        { label: 'プライバシーポリシー', path: '/privacy' },
        { label: '特定商取引法に基づく表記', path: '/commerce' },
      ],
    },
    ...(isOperator
      ? [{
          label: '運営者',
          items: [
            { label: '利用者管理', path: '/operator/users' },
            { label: '銀行振込申込管理', path: '/operator/bank-transfers' },
          ],
        }]
      : []),
  ];

  const activityItems: NavItem[] = [
    { label: '発情', path: '/breedings/new' },
    { label: '種付', path: '/breedings/method' },
    { label: '妊娠鑑定', path: '/breedings' },
    { label: '分娩', path: '/calvings/new' },
    { label: '治療', path: '/treatments/new' },
    { label: '投薬', path: '/treatments/new?recordType=投薬' },
    { label: 'ワクチン', path: '/vaccines/new' },
    { label: '農場作業', path: '/activities/new?type=farm' },
    { label: '個体の記録', path: '/activities/new?type=animal' },
    { label: '死亡・廃用', path: '/animal-lifecycle/new' },
  ];

  const otherItems = otherGroups.flatMap((group) => group.items);
  const isActiveOtherItem = (item: NavItem) => {
    if (item.path.startsWith('/analysis?scope=')) {
      return location.pathname === '/analysis' &&
        (new URLSearchParams(location.search).get('scope') === 'mothers' ? 'mothers' : 'farm') === item.path.split('scope=')[1];
    }
    if (item.path === '/ai-help?mode=record' || item.path === aiAskPath) {
      if (location.pathname !== '/ai-help') return false;
      const recording = new URLSearchParams(location.search).get('mode') === 'record';
      return item.path === '/ai-help?mode=record' ? recording : !recording;
    }
    return isActiveNavItem(location.pathname, item.path);
  };
  const otherActive = otherItems.some(isActiveOtherItem);
  const openOtherMenu = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget);
  const closeOtherMenu = () => setMenuAnchor(null);
  const openActivityMenu = (event: MouseEvent<HTMLElement>) => setActivityAnchor(event.currentTarget);
  const closeActivityMenu = () => setActivityAnchor(null);

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <AppBar position="sticky" color="primary" elevation={1} className="no-print">
        <Toolbar sx={{ minHeight: { xs: 48, sm: 64 }, px: { xs: 1, sm: 2 }, gap: { xs: 0.5, sm: 1.25 } }}>
          <Typography component={RouterLink} to="/" aria-label="ホームへ戻る" variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, color: 'inherit', textDecoration: 'none', width: 'fit-content', whiteSpace: 'nowrap', '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 4, borderRadius: 1 } }}>
            繁殖Farm Pro
          </Typography>

          <Box
            sx={{
              '& .MuiButton-root': {
                color: 'primary.contrastText',
                borderColor: 'rgba(255, 255, 255, 0.72)',
                minWidth: { xs: 0, sm: 104 },
                px: { xs: 0.75, sm: 1.5 },
                '&:hover': {
                  borderColor: 'primary.contrastText',
                  bgcolor: 'rgba(255, 255, 255, 0.08)',
                },
              },
            }}
          >
            <GlobalAnimalSearch />
          </Box>

          {!isAnimalDetailPage && (
            <Button
              size="small"
              variant="contained"
              onClick={openActivityMenu}
              aria-controls={activityAnchor ? 'activity-registration-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={activityAnchor ? 'true' : undefined}
              sx={{
                display: { xs: 'none', lg: 'inline-flex' },
                minWidth: 108,
                minHeight: 44,
                px: 1.25,
                fontWeight: 900,
                whiteSpace: 'nowrap',
                bgcolor: 'common.white',
                color: 'primary.main',
                '&:hover': {
                  bgcolor: 'grey.100',
                },
              }}
            >
              ＋ 記録する
            </Button>
          )}

          <Box
            component="nav"
            aria-label="主要メニュー"
            sx={{
              display: { xs: 'none', lg: 'flex' },
              alignItems: 'center',
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            {primaryItems.map((item) => {
              const active = isActiveNavItem(location.pathname, item.path);
              return (
                <Button
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  size="small"
                  aria-current={active ? 'page' : undefined}
                  variant="outlined"
                  sx={{
                    minWidth: 86,
                    minHeight: 44,
                    px: 1.25,
                    color: 'primary.contrastText',
                    borderColor: 'rgba(255,255,255,0.72)',
                    bgcolor: active ? 'rgba(255,255,255,0.18)' : 'transparent',
                    fontWeight: active ? 800 : 600,
                    whiteSpace: 'nowrap',
                    '&:hover': {
                      borderColor: 'primary.contrastText',
                      bgcolor: 'rgba(255,255,255,0.12)',
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}

            <Button
              size="small"
              variant="outlined"
              onClick={openOtherMenu}
              aria-controls={menuAnchor ? 'other-management-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={menuAnchor ? 'true' : undefined}
              sx={{
                minWidth: 96,
                minHeight: 44,
                px: 1.5,
                color: 'primary.contrastText',
                borderColor: 'rgba(255,255,255,0.72)',
                bgcolor: otherActive ? 'rgba(255,255,255,0.18)' : 'transparent',
                fontWeight: otherActive ? 800 : 600,
                whiteSpace: 'nowrap',
                '&:hover': {
                  borderColor: 'primary.contrastText',
                  bgcolor: 'rgba(255,255,255,0.12)',
                },
              }}
            >
              メニュー
            </Button>
          </Box>

          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            aria-label="メニュー"
            aria-controls={menuAnchor ? 'other-management-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={menuAnchor ? 'true' : undefined}
            onClick={openOtherMenu}
            sx={{
              display: { xs: 'inline-flex', sm: 'none' },
              width: 44,
              height: 44,
              color: 'primary.contrastText',
              border: '1px solid rgba(255, 255, 255, 0.72)',
              flexShrink: 0,
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap', fontWeight: 700 }}>
            {planLabel}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ px: { xs: 1.25, sm: 2, lg: 3 }, py: { xs: 1.25, sm: 2 } }}>
        <Box
          component="nav"
          aria-label="主要メニュー"
          className="no-print"
          sx={{
            mb: { xs: 1.25, sm: 2 },
            display: { xs: 'grid', sm: 'flex', lg: 'none' },
            gridTemplateColumns: `repeat(${isAnimalDetailPage ? 2 : 3}, minmax(0, 1fr))`,
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems: 'center',
            position: { xs: 'sticky', sm: 'static' },
            top: { xs: 48, sm: 'auto' },
            zIndex: { xs: 1200, sm: 'auto' },
            bgcolor: { xs: 'background.default', sm: 'transparent' },
            py: { xs: 0.75, sm: 0 },
          }}
        >
          {!isAnimalDetailPage && (
            <Button
              size="small"
              variant="contained"
              onClick={openActivityMenu}
              aria-controls={activityAnchor ? 'activity-registration-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={activityAnchor ? 'true' : undefined}
              sx={{ minWidth: { xs: 0, sm: 116 }, minHeight: 44, px: { xs: 0.75, sm: 1.5 }, fontSize: '1rem', fontWeight: 900, whiteSpace: 'nowrap' }}
            >
              ＋ 記録する
            </Button>
          )}

          {primaryItems.map((item) => {
            const active = isActiveNavItem(location.pathname, item.path);
            return (
              <Button key={item.path} component={RouterLink} to={item.path} size="small" aria-current={active ? 'page' : undefined} variant={active ? 'contained' : 'outlined'} sx={{ minWidth: { xs: 0, sm: 104 }, minHeight: 44, px: { xs: 1, sm: 1.5 }, fontSize: '1rem', whiteSpace: 'nowrap' }}>
                {item.label}
              </Button>
            );
          })}

          <Button size="small" variant={otherActive ? 'contained' : 'outlined'} onClick={openOtherMenu} aria-controls={menuAnchor ? 'other-management-menu' : undefined} aria-haspopup="true" aria-expanded={menuAnchor ? 'true' : undefined} sx={{ display: { xs: 'none', sm: 'inline-flex' }, minWidth: 96, minHeight: 44, px: 1.5, whiteSpace: 'nowrap' }}>
            メニュー
          </Button>
        </Box>

        <Menu
          id="activity-registration-menu"
          anchorEl={activityAnchor}
          open={Boolean(activityAnchor)}
          onClose={closeActivityMenu}
          MenuListProps={{ 'aria-label': '記録する内容' }}
        >
          {activityItems.map((item) => (
            <MenuItem
              key={item.path}
              component={RouterLink}
              to={item.path}
              onClick={closeActivityMenu}
              sx={{ minHeight: 44, minWidth: 180, fontWeight: 700 }}
            >
              {item.label}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          id="other-management-menu"
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeOtherMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          marginThreshold={8}
          PaperProps={{
            sx: {
              width: { xs: 'calc(100vw - 16px)', sm: 720, md: 1000 },
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 64px)',
              bgcolor: 'background.default',
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
            },
          }}
          MenuListProps={{
            'aria-label': '全メニュー',
            style: { width: '100%' },
            sx: {
              display: 'block',
              columnCount: { xs: 1, sm: 2, md: 3 },
              columnGap: 1.5,
              p: 1.5,
            },
          }}
        >
          <Box sx={{ columnSpan: 'all', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5,
            position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.default' }}>
            <Typography fontWeight={800} fontSize="1.1rem">メニュー</Typography>
            <Button aria-label="メニューを閉じる" onClick={closeOtherMenu} startIcon={<CloseIcon fontSize="small" />} sx={{ minHeight: 44, px: 1.5 }}>
              閉じる
            </Button>
          </Box>

          {otherGroups.map((group) => (
            <Box
              key={group.label}
              sx={{
                breakInside: 'avoid',
                display: 'inline-block',
                width: '100%',
                mb: 1.5,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
                overflow: 'hidden',
                verticalAlign: 'top',
              }}
            >
              <ListSubheader
                disableSticky
                sx={{
                  fontWeight: 800,
                  fontSize: '0.9375rem',
                  lineHeight: 1.5,
                  px: 1.5,
                  py: 1,
                  bgcolor: '#eaf1fb',
                  color: 'primary.dark',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                {group.label}
              </ListSubheader>
              {group.items.map((item) => (
                <MenuItem
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  selected={isActiveOtherItem(item)}
                  aria-current={isActiveOtherItem(item) ? 'page' : undefined}
                  onClick={(event) => {
                    if (item.path === aiAskPath) handleAiAskClick(event);
                    closeOtherMenu();
                  }}
                  sx={{
                    minHeight: '44px !important',
                    py: 1,
                    px: 1.5,
                    fontSize: '1rem',
                    lineHeight: 1.5,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    borderLeft: '3px solid transparent',
                    borderBottom: 1,
                    borderBottomColor: 'grey.100',
                    '&:last-child': { borderBottom: 0 },
                    '&.Mui-selected': {
                      bgcolor: '#e3efff',
                      color: 'primary.dark',
                      borderLeftColor: 'primary.main',
                      fontWeight: 800,
                    },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  {item.label}
                </MenuItem>
              ))}
            </Box>
          ))}
        </Menu>

        <Box
          sx={{
            pb: { xs: 2, sm: 3 },
            '& .MuiStack-root:has(> .MuiBox-root > .MuiAutocomplete-root)': {
              flexDirection: 'row !important',
              alignItems: 'flex-start !important',
              gap: '8px !important',
            },
            '& .MuiStack-root:has(> .MuiBox-root > .MuiAutocomplete-root) > .MuiBox-root': {
              flex: '1 1 auto',
              minWidth: 0,
            },
            '& .MuiStack-root:has(> .MuiBox-root > .MuiAutocomplete-root) > .MuiButton-root': {
              width: 44,
              minWidth: 44,
              height: 44,
              minHeight: 44,
              px: 0,
              mt: '6px !important',
              flexShrink: 0,
              fontSize: 0,
              borderRadius: 1.5,
              color: '#1565c0 !important',
              backgroundColor: '#ffffff !important',
              border: '1px solid #1565c0 !important',
              boxShadow: 'none !important',
              '&:hover': {
                color: '#0d47a1 !important',
                backgroundColor: '#f3f7fd !important',
                borderColor: '#0d47a1 !important',
                boxShadow: 'none !important',
              },
            },
            '& .MuiStack-root:has(> .MuiBox-root > .MuiAutocomplete-root) > .MuiButton-root .MuiButton-startIcon': {
              m: 0,
            },
            '& .MuiStack-root:has(> .MuiBox-root > .MuiAutocomplete-root) > .MuiButton-root .MuiSvgIcon-root': {
              fontSize: '1.35rem',
            },
          }}
        >
          {children}
        </Box>
      </Container>
    </Box>
  );
}
