import { MouseEvent, ReactNode, useState } from 'react';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, Menu, MenuItem, Stack, Toolbar, Typography } from '@mui/material';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import { getCurrentUser, isLoggedIn, logout } from '../services/authClient';

type Props = { children: ReactNode };
type NavItem = { label: string; path: string };

function isActiveNavItem(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const user = getCurrentUser();

  if (!isLoggedIn()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const primaryItems: NavItem[] = [
    { label: 'ホーム', path: '/' },
    { label: '牛台帳', path: '/cattle' },
    { label: '子牛管理', path: '/calves' },
    { label: '繁殖管理', path: '/breedings' },
    { label: '予定', path: '/schedules' },
    { label: 'カレンダー', path: '/calendar' },
  ];

  const otherItems: NavItem[] = [
    { label: '治療', path: '/treatments' },
    { label: 'ワクチン', path: '/vaccines' },
    { label: 'BLV', path: '/blv' },
    { label: 'アラート', path: '/alerts' },
    { label: '飼養管理', path: '/feedings' },
    { label: '飼料在庫', path: '/feed-inventory' },
    { label: '給与目安', path: '/feeding-guide' },
    { label: '対応記録', path: '/feeding-alert-actions' },
    { label: '出荷販売', path: '/sales' },
    { label: '経費管理', path: '/expenses' },
    { label: '月別収支', path: '/monthly-balance' },
    { label: 'レポート', path: '/reports' },
    { label: '印刷', path: '/print' },
    { label: 'バックアップ', path: '/backups' },
    { label: '設定', path: '/settings' },
    { label: 'ヘルプ', path: '/help' },
  ];

  const otherActive = otherItems.some((item) => isActiveNavItem(location.pathname, item.path));
  const openOtherMenu = (event: MouseEvent<HTMLButtonElement>) => setMenuAnchor(event.currentTarget);
  const closeOtherMenu = () => setMenuAnchor(null);

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <AppBar position="sticky" color="primary" elevation={1} className="no-print">
        <Toolbar sx={{ minHeight: { xs: 48, sm: 64 }, gap: 1 }}>
          <Typography component={RouterLink} to="/" aria-label="ホームへ戻る" variant="h6" sx={{ flexGrow: 1, fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, color: 'inherit', textDecoration: 'none', width: 'fit-content', '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 4, borderRadius: 1 } }}>
            繁殖Farm Pro
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>{user?.farmName}</Typography>
            <Button color="inherit" size="small" onClick={logout}>ログアウト</Button>
          </Stack>
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

          <Menu id="other-management-menu" anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeOtherMenu} MenuListProps={{ 'aria-label': 'その他の管理メニュー' }}>
            {otherItems.map((item) => (
              <MenuItem key={item.path} component={RouterLink} to={item.path} selected={isActiveNavItem(location.pathname, item.path)} onClick={closeOtherMenu}>
                {item.label}
              </MenuItem>
            ))}
          </Menu>

          <GlobalAnimalSearch />
        </Box>
        <Box sx={{ pb: { xs: 2, sm: 3 } }}>{children}</Box>
      </Container>
    </Box>
  );
}
