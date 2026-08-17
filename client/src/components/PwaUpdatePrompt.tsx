import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function currentBundleSrc() {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') || '';
}

function latestBundleSrc(html: string) {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
    || html.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i);
  return match?.[1] || '';
}

export function PwaUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkForUpdate = async () => {
      if (checkingRef.current || !navigator.onLine) return;
      checkingRef.current = true;

      try {
        const response = await fetch(`/index.html?farmpro-update-check=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) return;

        const html = await response.text();
        const current = currentBundleSrc();
        const latest = latestBundleSrc(html);
        if (current && latest && current !== latest) setOpen(true);
      } catch {
        // 通信できない時は何もせず、次回の確認に任せる。
      } finally {
        checkingRef.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    const handleFocus = () => void checkForUpdate();

    void checkForUpdate();
    const timer = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const reload = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      } catch {
        // 更新確認に失敗しても再読み込みは行う。
      }
    }
    window.location.reload();
  };

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ mb: { xs: 1, sm: 2 } }}
    >
      <Alert
        severity="info"
        variant="filled"
        action={
          <Button color="inherit" size="small" onClick={() => void reload()} sx={{ fontWeight: 800 }}>
            最新版を表示
          </Button>
        }
        sx={{ width: '100%', alignItems: 'center' }}
      >
        FarmProの新しい版があります。入力中の内容を確認してから更新してください。
      </Alert>
    </Snackbar>
  );
}
