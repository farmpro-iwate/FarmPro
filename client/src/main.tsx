import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import { initializeFarmProStorage } from './storage/initialize';
import { startAutomaticBackup } from './services/automaticBackup';
import { runStartupDeviceSync } from './services/automaticDeviceSync';
import { refreshAuthUser } from './services/authClient';
import './print.css';
import './responsiveTables.css';

const theme = createTheme({
  palette: { primary: { main: '#2e7d32' } },
  shape: { borderRadius: 12 },
  typography: {
    h4: { fontSize: 'clamp(1.45rem, 4vw, 2rem)' },
    h5: { fontSize: 'clamp(1.25rem, 3.5vw, 1.6rem)' },
  },
});

const activityCardSelector = '.MuiCard-root:has(a[href$="/breedings/new"]):has(a[href$="/pregnancy-checks"]):has(a[href$="/calvings/new"]):has(a[href$="/treatments/new"])';

const activityButtonStyles = {
  [`${activityCardSelector} a.MuiButton-contained`]: {
    minHeight: 64,
    fontSize: '1rem',
    fontWeight: 800,
    gap: '8px',
    borderRadius: '14px',
  },
  [`${activityCardSelector} a.MuiButton-contained[href$="/breedings/new"]::before`]: {
    content: '"❤️"',
    fontSize: '1.25rem',
  },
  [`${activityCardSelector} a.MuiButton-contained[href$="/pregnancy-checks"]::before`]: {
    content: '"🔎"',
    fontSize: '1.25rem',
  },
  [`${activityCardSelector} a.MuiButton-contained[href$="/calvings/new"]::before`]: {
    content: '"🍼"',
    fontSize: '1.25rem',
  },
  [`${activityCardSelector} a.MuiButton-contained[href$="/treatments/new"]::before`]: {
    content: '"💉"',
    fontSize: '1.25rem',
  },
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
const baseUrl = import.meta.env.BASE_URL;

function renderStatus(title: string, message: string) {
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>
              {title}
            </h1>
            <p style={{ margin: 0 }}>{message}</p>
          </div>
        </main>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

function renderApp() {
  root.render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles styles={activityButtonStyles} />
        <BrowserRouter basename={baseUrl}>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
  } catch (error) {
    console.warn('Service Workerを登録できませんでした。', error);
  }
}

async function startApp() {
  renderStatus(
    'FarmProを起動しています',
    '端末内データを準備しています…',
  );

  try {
    await initializeFarmProStorage(__APP_VERSION__);
    await refreshAuthUser();

    try {
      await runStartupDeviceSync();
    } catch (syncError) {
      console.warn('起動時の複数端末同期を完了できませんでした。', syncError);
    }

    startAutomaticBackup();
    renderApp();
    void registerServiceWorker();
  } catch (error) {
    console.error('IndexedDBの初期化に失敗しました。', error);

    renderStatus(
      'FarmProを起動できませんでした',
      '端末内データの準備に失敗しました。画面を再読み込みしてください。',
    );
  }
}

void startApp();
