import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardContent, Stack, Typography } from '@mui/material';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISSED_KEY = 'farmpro.pwaInstallPromptDismissed';

function isStandalone() {
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(standaloneMedia || iosStandalone);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [installed, setInstalled] = useState(() => isStandalone());
  const ios = useMemo(() => isIos(), []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      localStorage.removeItem(DISMISSED_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      localStorage.removeItem(DISMISSED_KEY);
    }
    setInstallEvent(null);
  };

  return (
    <Card variant="outlined" className="no-print" sx={{ mb: 2, borderColor: 'primary.main', bgcolor: 'success.50' }}>
      <CardContent>
        <Stack spacing={1.25}>
          <Typography variant="h6" fontWeight={900}>FarmProをホーム画面に追加</Typography>
          <Typography color="text.secondary">
            ホーム画面からすぐ開けるようにすると、毎日の記録が始めやすくなります。インストールは無料で、あとからでもできます。
          </Typography>

          {installEvent ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" onClick={install} sx={{ fontWeight: 800 }}>
                アプリとしてインストール
              </Button>
              <Button variant="text" onClick={dismiss}>今はしない</Button>
            </Stack>
          ) : ios ? (
            <>
              <Alert severity="info">
                iPhone / iPadでは、Safariの共有ボタンから「ホーム画面に追加」を選んでください。
              </Alert>
              <Button variant="text" onClick={dismiss} sx={{ alignSelf: 'flex-start' }}>今はしない</Button>
            </>
          ) : (
            <>
              <Alert severity="info">
                ブラウザのメニューに「アプリをインストール」または「ホーム画面に追加」が表示されたら選んでください。
              </Alert>
              <Button variant="text" onClick={dismiss} sx={{ alignSelf: 'flex-start' }}>今はしない</Button>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
