import { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';

type Props = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  path: string;
};

function isActiveNavItem(
  currentPath: string,
  itemPath: string,
) {
  if (itemPath === '/') {
    return currentPath === '/';
  }

  return (
    currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
  );
}

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const navItems: NavItem[] = [
    // 日常管理
    { label: 'ホーム', path: '/' },
    { label: '牛台帳', path: '/cattle' },
    { label: '子牛管理', path: '/calves' },
    { label: '繁殖管理', path: '/breedings' },
    { label: '予定', path: '/schedules' },
    { label: 'カレンダー', path: '/calendar' },
    { label: '治療', path: '/treatments' },
    { label: 'ワクチン', path: '/vaccines' },
    { label: 'BLV', path: '/blv' },
    { label: 'アラート', path: '/alerts' },
    // 飼養管理
    { label: '飼養管理', path: '/feedings' },
    { label: '飼料在庫', path: '/feed-inventory' },
    { label: '給与目安', path: '/feeding-guide' },
    { label: '対応記録', path: '/feeding-alert-actions' },
    // 経営管理・出力
    { label: '出荷販売', path: '/sales' },
    { label: '経費管理', path: '/expenses' },
    { label: '月別収支', path: '/monthly-balance' },
    { label: 'レポート', path: '/reports' },
    { label: '印刷', path: '/print' },
    // 保守・案内
    { label: 'バックアップ', path: '/backups' },
    { label: '設定', path: '/settings' },
    { label: 'ヘルプ', path: '/help' },
  ];

  return (
    <Box
      minHeight="100vh"
      bgcolor="background.default"
    >
      <AppBar
        position="sticky"
        color="primary"
        elevation={1}
        className="no-print"
      >
        <Toolbar
          sx={{
            minHeight: { xs: 48, sm: 64 },
          }}
        >
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 800,
              fontSize: { xs: '1.05rem', sm: '1.25rem' },
            }}
          >
            繁殖Farm Pro
          </Typography>
        </Toolbar>
      </AppBar>
      <Container
        maxWidth="md"
        sx={{
          px: { xs: 1.25, sm: 2 },
          py: { xs: 1.25, sm: 2 },
        }}
      >
        <Box
          component="nav"
          aria-label="主要メニュー"
          className="no-print"
          sx={{
            mb: { xs: 1.25, sm: 2 },
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems: 'center',
          }}
        >
          {navItems.map((item) => {
            const active = isActiveNavItem(
              location.pathname,
              item.path,
            );

            return (
              <Button
                key={
                  item.path
                }
                component={
                  RouterLink
                }
                to={
                  item.path
                }
                size="small"
                aria-current={
                  active ? 'page' : undefined
                }
                variant={
                  active ? 'contained' : 'outlined'
                }
                sx={{
                  minWidth: { xs: 88, sm: 104 },
                  minHeight: { xs: 34, sm: 32 },
                  px: { xs: 1, sm: 1.5 },
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Box>
        <Box
          sx={{
            pb: { xs: 2, sm: 3 },
          }}
        >
          {children}
        </Box>
      </Container>
    </Box>
  );
}
