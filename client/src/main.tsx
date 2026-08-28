import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';
import { initializeFarmProStorage } from './storage/initialize';
import { refreshAuthUser } from './services/authClient';
import { runStartupDeviceSync } from './services/automaticDeviceSync';
import { syncAccountToFarmSettings } from './services/settingsApi';
import './print.css';
import './responsiveTables.css';

const theme = createTheme({
  palette: {
    primary: { main: '#1565c0', dark: '#0d47a1', light: '#5e92f3' },
    success: { main: '#1565c0', dark: '#0d47a1', light: '#5e92f3', contrastText: '#ffffff' },
    background: { default: '#f5f7fb' },
  },
  shape: { borderRadius: 12 },
  typography: {
    h4: { fontSize: 'clamp(1.45rem, 4vw, 2rem)' },
    h5: { fontSize: 'clamp(1.25rem, 3.5vw, 1.6rem)' },
  },
});

const activityCardSelector = '.MuiCard-root:has(a[href$="/breedings/new"]):has(a[href$="/pregnancy-checks"]):has(a[href$="/calvings/new"]):has(a[href$="/treatments/new"])';
const farmSummaryCardSelector = '.MuiCard-root:has(a[href$="/cattle"]):has(a[href$="/calves"]):has(a[href$="/alerts"]):has(a[href$="/monthly-balance"])';
const farmStoryCardSelector = `${farmSummaryCardSelector} + .MuiCard-root`;
const trialGuideCardSelector = '.MuiCard-root:has(a.MuiButton-contained[href$="/help"])';

const homeCardStyles = {
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
  [trialGuideCardSelector]: {
    display: 'none',
  },
  [`${farmStoryCardSelector} .MuiStack-root > .MuiCard-root:nth-of-type(n+4)`]: {
    display: 'none',
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(-n+4) .MuiCardContent-root`]: {
    padding: '14px',
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(-n+4) .MuiTypography-h4`]: {
    marginTop: '2px',
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(4) .MuiCard-root`]: {
    borderWidth: '2px',
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(7)`]: {
    order: 5,
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(5)`]: {
    order: 6,
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(6)`]: {
    order: 7,
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(7) .MuiCardContent-root`]: {
    paddingTop: '18px',
    paddingBottom: '18px',
  },
  [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(7) .MuiTypography-h5`]: {
    fontSize: '1.5rem',
  },
  '@media (max-width: 599.95px)': {
    [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(5), ${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(6)`]: {
      flexBasis: '50%',
      maxWidth: '50%',
    },
    [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(7)`]: {
      flexBasis: '100%',
      maxWidth: '100%',
    },
    [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(5) .MuiCardContent-root, ${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(6) .MuiCardContent-root`]: {
      padding: '14px',
    },
    [`${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(5) .MuiTypography-h5, ${farmSummaryCardSelector} .MuiGrid-container > .MuiGrid-item:nth-of-type(6) .MuiTypography-h5`]: {
      fontSize: '1.05rem',
    },
  },
};

const BACKGROUND_SYNC_INTERVAL_MS = 30_000;
let backgroundSyncInFlight = false;

async function runBackgroundDeviceSync() {
  if (backgroundSyncInFlight || document.visibilityState !== 'visible') return;

  backgroundSyncInFlight = true;
  try {
    const result = await runStartupDeviceSync();
    if (result === 'pulled-empty-local' || result === 'cloud-newer') {
      window.location.reload();
    }
  } catch (error) {
    console.warn('バックグラウンド同期を完了できませんでした。', error);
  } finally {
    backgroundSyncInFlight = false;
  }
}

function registerBackgroundDeviceSync() {
  window.setInterval(() => {
    void runBackgroundDeviceSync();
  }, BACKGROUND_SYNC_INTERVAL_MS);

  window.addEventListener('focus', () => {
    void runBackgroundDeviceSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runBackgroundDeviceSync();
    }
  });
}

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
        <GlobalStyles styles={homeCardStyles} />
        <BrowserRouter basename={baseUrl}>
          <PwaInstallPrompt />
          <PwaUpdatePrompt />
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
    const authUser = await refreshAuthUser();
    if (authUser) await syncAccountToFarmSettings(authUser);
    renderApp();
    if (authUser) registerBackgroundDeviceSync();
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
