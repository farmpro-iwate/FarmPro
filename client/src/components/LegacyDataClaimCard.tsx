import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { getStoredAuthUser } from '../services/authClient';
import {
  claimLegacyDbForFarm,
  hasLegacyFarmProData,
  isLegacyDbClaimValidForFarm,
} from '../storage/legacyDbOwnership';

export function LegacyDataClaimCard() {
  const user = getStoredAuthUser();
  const [checking, setChecking] = useState(true);
  const [hasLegacyData, setHasLegacyData] = useState(false);
  const [claimed, setClaimed] = useState(() => Boolean(user?.farmId && isLegacyDbClaimValidForFarm(user.farmId)));

  useEffect(() => {
    let cancelled = false;
    hasLegacyFarmProData()
      .then((found) => {
        if (!cancelled) setHasLegacyData(found);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user || checking || !hasLegacyData) return null;

  const handleClaim = () => {
    if (!user.farmId) return;
    const ok = window.confirm(
      `この端末に残っている旧FarmProデータを「${user.farmName || '現在の農場'}」へ引き継ぎます。\n\n` +
      'この操作でデータは削除されません。\n別の農場アカウントからは見えなくなります。\n\n続けますか？',
    );
    if (!ok) return;

    claimLegacyDbForFarm(user.farmId);
    setClaimed(true);
    window.location.reload();
  };

  return (
    <Card variant="outlined" className="no-print">
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={800}>この端末の旧データ</Typography>
          {claimed ? (
            <Alert severity="success">
              この端末の旧FarmProデータは「{user.farmName || '現在の農場'}」に引き継がれています。
            </Alert>
          ) : (
            <>
              <Alert severity="warning">
                この端末に旧FarmProデータが残っています。現在はどの農場にも自動では割り当てていません。
              </Alert>
              <Button variant="contained" onClick={handleClaim}>
                この農場に旧データを引き継ぐ
              </Button>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
