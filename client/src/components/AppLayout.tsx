import { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';

type Props = { children: ReactNode };

export function AppLayout({ children }: Props) {
  const location = useLocation();
  const navItems = [
    { label: 'ホーム', path: '/' },
    { label: 'アラート', path: '/alerts' },
    { label: '繁殖牛台帳', path: '/cattle' },
    { label: '子牛台帳', path: '/calves' },
    { label: '繁殖管理', path: '/breedings' },
    { label: '出荷・販売', path: '/sales' },
    { label: '収支管理', path: '/monthly-balance' },
    { label: 'バックアップ', path: '/backups' }
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
              variant={location.pathname === item.path ? 'contained' : 'outlined'}
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
