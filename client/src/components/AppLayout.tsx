import { MouseEvent, ReactNode, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, ListSubheader, Menu, MenuItem, Toolbar, Typography } from '@mui/material';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';

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

  const primaryItems: NavItem[] = [
    { label: 'ホーム', path: '/' },
    { label: '繁殖管理', path: '/breedings' },
    { label: '予定', path: '/schedules' },
    { label: 'カレンダー', path: '/calendar' },
  ];

  const otherGroups: NavGroup[] = [
    {
      label: '個体・健康',
      items: [
        { label: '繁殖牛台帳', path: '/cattle' },
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
        { label: 'バックアップ', path: '/backups' },
        { label: '印刷', path: '/print' },
        { label: '設定', path: '/settings' },
        { label: '有料プラン申込', path: '/paid-plan' },
        { label: 'ヘルプ', path: '/help' },
        { label: 'ログアウト', path: '/logout' },
      ],
    },
  ];

  const otherItems = otherGroups.flatMap((group) => group.items);
  const otherActive = otherItems.some((item) => isActiveNavItem(location.pathname, item.path));
  const openOtherMenu = (event: MouseEvent<HTMLButtonElement>) => setMenuAnchor(event.currentTarget);
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

          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>
            この端末内に保存
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ px: { xs: 1.25, sm: 2 }, py: { xs: 1.25, sm: 2 } }}>
        <Box component="nav" aria-label="主要メニュー" className="no-print" sx={{ mb: { xs: 1.25, sm: 2 }, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          {primaryItems.map((item) => {
            const active = isActiveNavItem(location.pathname, item.path);
            return (
              <Button key={item.path} component={RouterLink} to={item.path} size="small" aria-current={active ? 'page' : undefined} variant={active ? 'contained' : 'outlined'} sx={{ minWidth: { xs: 88, sm: 104 }, minHeight: { xs: 34, sm: 32 }, px: { xs: 1, sm: 1.5 }, whiteSpace: 'nowrap' }}>
                {item.label}
              </Button>
            );
          })}

          <Button size="small" variant={otherActive ? 'contained' : 'outlined'} onClick={openOtherMenu} aria-controls={menuAnchor ? 'other-management-menu' : undefined} aria-haspopup="true" aria-expanded={menuAnchor ? 'true' : undefined} sx={{ minWidth: { xs: 110, sm: 126 }, minHeight: { xs: 34, sm: 32 }, px: { xs: 1, sm: 1.5 }, whiteSpace: 'nowrap' }}>
            その他の管理
          </Button>

          <Menu
            id="other-management-menu"
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={closeOtherMenu}
            PaperProps={{
              sx: {
                width: { xs: 'calc(100vw - 24px)', sm: 540 },
                maxWidth: 'calc(100vw - 24px)',
                maxHeight: 'calc(100vh - 80px)',
              },
            }}
            MenuListProps={{
              'aria-label': 'その他の管理メニュー',
              sx: {
                display: 'block',
                columnCount: { xs: 1, sm: 2 },
                columnGap: { sm: 1 },
                p: { xs: 1, sm: 0.75 },
              },
            }}
          >
            {otherGroups.map((group) => (
              <Box
                key={group.label}
                sx={{
                  breakInside: 'avoid',
                  display: 'inline-block',
                  width: '100%',
                  mb: { xs: 1, sm: 0.5 },
                  border: { xs: 1, sm: 0 },
                  borderColor: 'divider',
                  borderRadius: { xs: 1, sm: 0 },
                  overflow: 'hidden',
                  verticalAlign: 'top',
                }}
              >
                <ListSubheader
                  disableSticky
                  sx={{
                    fontWeight: 900,
                    fontSize: { xs: 'inherit', sm: '0.82rem' },
                    lineHeight: { xs: 2.5, sm: 1.4 },
                    px: { xs: 2, sm: 0.75 },
                    py: { sm: 0.2 },
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
                      minHeight: { xs: 48, sm: 28 },
                      py: { xs: 0.75, sm: 0.125 },
                      px: { xs: 2, sm: 0.75 },
                      fontSize: { xs: 'inherit', sm: '0.88rem' },
                      lineHeight: { sm: 1.2 },
                      borderRadius: { sm: 0.75 },
                    }}
                  >
                    {item.label}
                  </MenuItem>
                ))}
              </Box>
            ))}
          </Menu>
        </Box>
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
              color: '#2e7d32 !important',
              backgroundColor: '#ffffff !important',
              border: '1px solid #2e7d32 !important',
              boxShadow: 'none !important',
              '&:hover': {
                color: '#1b5e20 !important',
                backgroundColor: '#f1f8f2 !important',
                borderColor: '#1b5e20 !important',
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
