import type { ReactNode } from 'react';
import { Alert, Button, Container, Stack } from '@mui/material';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { APPROVED_CLOUD_RECOVERY } from '../services/approvedCloudRecovery';
import { isRecoveredDeviceSyncEnabled } from '../services/deviceSync';
import { isCloudRecoveryPaused } from '../services/syncRecoveryGuard';
import { DeviceSyncPage } from '../pages/DeviceSyncPage';

/** Check before startup migrations or account-to-farm metadata writes. */
export function shouldProtectRecoveryStartup(): boolean {
  return isCloudRecoveryPaused() ||
    (getStoredAuthUser()?.farmId === APPROVED_CLOUD_RECOVERY.farmId && !isRecoveredDeviceSyncEnabled());
}

export function RecoveryStartupGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!shouldProtectRecoveryStartup()) return <>{children}</>;
  // Keep authentication available without mounting ordinary data pages.
  if (location.pathname === '/login' || location.pathname === '/logout') return <>{children}</>;
  if (!hasAuthToken()) return <Navigate to="/login" replace />;
  const user = getStoredAuthUser();
  if (user?.farmId !== APPROVED_CLOUD_RECOVERY.farmId || !user.active || user.role !== 'owner' ||
      (user.plan !== 'standard' && user.plan !== 'pro')) {
    // Never fall through to DeviceSyncPage's legacy automatic sync when this
    // protected session cannot use the reviewed recovery actions.
    return <Container maxWidth="md" sx={{ py: 2 }}><Stack spacing={2}>
      <Alert severity="warning">この農場の管理者（Standard / Pro）でログインして復旧を確認してください。端末の記録は変更していません。</Alert>
      <Button component={RouterLink} to="/logout" variant="outlined">ログインし直す</Button>
    </Stack></Container>;
  }
  if (location.pathname !== '/device-sync') return <Navigate to="/device-sync" replace />;
  // The regular layout includes animal search and navigation into automatic
  // record pulls. Mount only the read-only recovery entry until it is verified.
  return <Container maxWidth="md" sx={{ py: 2 }}><DeviceSyncPage /></Container>;
}
