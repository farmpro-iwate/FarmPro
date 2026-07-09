import { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';

type Props = { children: ReactNode };

type NavItem = {
  label: string;
  path: string;
};

function isActiveNavItem(currentPath: string, itemPath: string) {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const navItems: NavItem[] = [
    { label: 'ホーム', path: '/' },
    { label: 'アラート', path: '/alerts' },
    { label: 'カレンダー', path: '/calendar' },
    { label: '印刷', path: '/print' },
    { label: 'バックアップ', path: '/backups' },
    { label: '設定', path: '/settings' },
    { label: 'ヘルプ', path: '/help' },
    { label: '予定', path: '/schedules' },
    { label: '治療', path: '/treatments' },
    { label: '牛台帳', path: '/cattle' },
    { label: '子牛管理', path: '/calves' },
    { label: '繁殖管理', path: '/breedings' },
    { label: 'ワクチン', path: '/vaccines' },
    { label: 'BLV', path: '/blv' },
    { label: '出荷販売', path: '/sales' },
    { label: '経費管理', path: '/expenses' },
    { label: '月別収支', path: '/monthly-balance' },
    { label: '飼養管理', path: '/feedings' },
    { label: '飼料在庫', path: '/feed-inventory' },
    { label: 'レポート', path: '/reports' },
    { label: '給与目安', path: '/feeding-guide' },
    { label: '対応記録', path: '/feeding-alert-actions' },
  ];

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <AppBar position="sticky" color="primary" elevation={1} className="no-print">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 800 }}>
            🐄 繁殖Farm Pro
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: 'auto' }} className="no-print">
          {navItems.map((item) => (
            <Button
              key={item.path}
              component={RouterLink}
              to={item.path}
              variant={isActiveNavItem(location.pathname, item.path) ? 'contained' : 'outlined'}
              sx={{ minWidth: 110 }}
            >
              {item.label}
            </Button>
          ))}
        </Stack>
        {children}
      </Container>
    </Box>
  );
}
