import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack } from '@mui/material';

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
  const location = useLocation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showInstructions, setShowInstructions] = useState(false);
  const ios = useMemo(() => isIos(), []);
  const onHome = location.pathname === '/';

  useEffect(() => {
    setShowInstructions(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowInstructions(false);
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

  if (!onHome || installed || dismissed) return null;

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
    <Card variant="outlined" className="no-print" sx={{ mx: { xs: 1.25, sm: 2 }, mt: 1, mb: 0 }}>
      <CardContent sx={{ px: 1, py: 0.25, '&:last-child': { pb: 0.25 } }}>
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="space-between">
          <Button
            variant="text"
            onClick={installEvent ? install : () => setShowInstructions((open) => !open)}
            aria-expanded={installEvent ? undefined : showInstructions}
            aria-controls={installEvent ? undefined : 'pwa-install-instructions'}
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            ホーム画面に追加
          </Button>
          <Button variant="text" onClick={dismiss} aria-label="ホーム画面への追加案内を閉じる" sx={{ minHeight: 44, color: 'text.secondary' }}>
            閉じる
          </Button>
        </Stack>
        {!installEvent && showInstructions && (
          <Alert id="pwa-install-instructions" severity="info" sx={{ mt: 0.5, mb: 0.75 }}>
            {ios
              ? 'iPhone / iPadでは、Safariの共有ボタンから「ホーム画面に追加」を選んでください。'
              : 'ブラウザのメニューに「アプリをインストール」または「ホーム画面に追加」が表示されたら選んでください。'}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
