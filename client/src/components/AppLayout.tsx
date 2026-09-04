import { MouseEvent, ReactNode, useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, IconButton, ListSubheader, Menu, MenuItem, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';

type Props = { children: ReactNode };
type NavItem = { label: string; path: string };
type NavGroup = { label: string; items: NavItem[] };

function isActiveNavItem(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [isOperator, setIsOperator] = useState(false);
  const authUser = getStoredAuthUser();
  const planLabel = authUser?.plan === 'pro'
    ? 'Pro / クラウド対応'
    : authUser?.plan === 'standard'
      ? 'Standard / クラウド対応'
      : 'Free / この端末内に保存';

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

  const primaryItems: NavItem[] = [
    { label: 'ホーム', path: '/' },
    { label: '予定', path: '/schedules' },
    { label: 'カレンダー', path: '/calendar' },
  ];

  const otherGroups: NavGroup[] = [
    {
      label: '個体・健康',
      items: [
        { label: '繁殖牛台帳', path: '/cattle' },
        { label: '繁殖管理', path: '/breedings' },
        { label: '子牛台帳', path: '/calves' },
        { label: '分娩記録', path: '/calvings' },
        { label: '治療履歴', path: '/treatments' },
        { label: 'ワクチン', path: '/vaccines' },
        { label: 'アラート', path: '/alerts' },
      ],
    },
    {
      label: '飼養',
      items: [
        { label: '飼養管理', path: '/feedings' },
        { label: '給与目安', path: '/feeding-guide' },
        { label: '飼料在庫', path: '/feed-inventory' },
      ],
    },
    {
      label: '出荷・販売',
      items: [
        { label: '市場出荷予定', path: '/market-shipping-plan' },
        { label: '出荷販売', path: '/sales' },
      ],
    },
    {
      label: '経営',
      items: [
        { label: '経費管理', path: '/expenses' },
        { label: '月別収支', path: '/monthly-balance' },
        { label: 'レポート', path: '/reports' },
      ],
    },
    {
      label: 'データ・設定',
      items: [
        { label: '牛情報を取り込む', path: '/animal-import' },
        { label: 'マスター登録', path: '/masters' },
        { label: 'バックアップ', path: '/backups' },
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

  const otherItems = otherGroups.flatMap((group) => group.items);
  const otherActive = otherItems.some((item) => isActiveNavItem(location.pathname, item.path));
  const openOtherMenu = (event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget);
  const closeOtherMenu = () => setMenuAnchor(null);

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <AppBar position="sticky" color="primary" elevation={1} className="no-print">
        <Toolbar sx={{ minHeight: { xs: 48, sm: 64 }, gap: { xs: 0.75, sm: 1.25 } }}>
          <Typography component={RouterLink} to="/" aria-label="ホームへ戻る" variant="h6" sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, color: 'inherit', textDecoration: 'none', width: 'fit-content', whiteSpace: 'nowrap', '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 4, borderRadius: 1 } }}>
            繁殖Farm Pro
          </Typography>

          <Box
            sx={{
              '& .MuiButton-root': {
                color: 'primary.contrastText',
                borderColor: 'rgba(255, 255, 255, 0.72)',
                minWidth: { xs: 92, sm: 104 },
                px: { xs: 1, sm: 1.5 },
                '&:hover': {
                  borderColor: 'primary.contrastText',
                  bgcolor: 'rgba(255, 255, 255, 0.08)',
                },
              },
            }}
          >
            <GlobalAnimalSearch />
          </Box>

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
                    minHeight: 34,
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
                minWidth: 126,
                minHeight: 34,
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
              その他の管理
            </Button>
          </Box>

          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            aria-label="その他の管理"
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
            display: { xs: 'flex', lg: 'none' },
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems: 'center',
          }}
        >
          {primaryItems.map((item) => {
            const active = isActiveNavItem(location.pathname, item.path);
            return (
              <Button key={item.path} component={RouterLink} to={item.path} size="small" aria-current={active ? 'page' : undefined} variant={active ? 'contained' : 'outlined'} sx={{ minWidth: { xs: 88, sm: 104 }, minHeight: { xs: 34, sm: 32 }, px: { xs: 1, sm: 1.5 }, whiteSpace: 'nowrap' }}>
                {item.label}
              </Button>
            );
          })}

          <Button size="small" variant={otherActive ? 'contained' : 'outlined'} onClick={openOtherMenu} aria-controls={menuAnchor ? 'other-management-menu' : undefined} aria-haspopup="true" aria-expanded={menuAnchor ? 'true' : undefined} sx={{ display: { xs: 'none', sm: 'inline-flex' }, minWidth: 126, minHeight: 32, px: 1.5, whiteSpace: 'nowrap' }}>
            その他の管理
          </Button>
        </Box>

        <Menu
          id="other-management-menu"
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeOtherMenu}
          PaperProps={{
            sx: {
              width: { xs: 'calc(100vw - 16px)', sm: 540 },
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'calc(100vh - 64px)',
            },
          }}
          MenuListProps={{
            'aria-label': 'その他の管理メニュー',
            sx: {
              display: 'block',
              columnCount: { xs: 1, sm: 2 },
              columnGap: { sm: 1 },
              p: { xs: 0.125, sm: 0.75 },
            },
          }}
        >
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, justifyContent: 'flex-end', height: 32, alignItems: 'center', pr: 0.25 }}>
            <IconButton size="small" aria-label="メニューを閉じる" onClick={closeOtherMenu} sx={{ width: 30, height: 30 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {otherGroups.map((group) => (
            <Box
              key={group.label}
              sx={{
                breakInside: 'avoid',
                display: 'inline-block',
                width: '100%',
                mb: { xs: 0, sm: 0.5 },
                border: { xs: 1, sm: 0 },
                borderColor: 'divider',
                borderRadius: { xs: 0.75, sm: 0 },
                overflow: 'hidden',
                verticalAlign: 'top',
              }}
            >
              <ListSubheader
                disableSticky
                sx={{
                  fontWeight: 900,
                  fontSize: { xs: '0.86rem', sm: '0.82rem' },
                  lineHeight: { xs: '24px', sm: 1.4 },
                  minHeight: { xs: 24, sm: 'auto' },
                  px: { xs: 1, sm: 0.75 },
                  py: 0,
                  bgcolor: { sm: 'transparent' },
                  color: 'text.secondary',
                }}
              >
                {group.label}
              </ListSubheader>
              {group.items.map((item) => (
                <MenuItem
                  key={item.path}
                  component={RouterLink}
                  to={item.path}
                  selected={isActiveNavItem(location.pathname, item.path)}
                  onClick={closeOtherMenu}
                  sx={{
                    minHeight: { xs: '30px !important', sm: 28 },
                    height: { xs: 30, sm: 'auto' },
                    py: { xs: '0 !important', sm: 0.125 },
                    px: { xs: 1, sm: 0.75 },
                    fontSize: { xs: '0.92rem', sm: '0.88rem' },
                    lineHeight: { xs: 1.05, sm: 1.2 },
                    borderRadius: { sm: 0.75 },
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
