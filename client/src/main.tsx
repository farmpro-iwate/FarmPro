import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import { installAuthenticatedFetch } from './services/authClient';
import { initializeFarmProStorage } from './storage/initialize';
import './print.css';
import './responsiveTables.css';

installAuthenticatedFetch();

const theme = createTheme({
  palette: { primary: { main: '#2e7d32' } },
  shape: { borderRadius: 12 },
  typography: {
    h4: { fontSize: 'clamp(1.45rem, 4vw, 2rem)' },
    h5: { fontSize: 'clamp(1.25rem, 3.5vw, 1.6rem)' },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root')!);

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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

async function startApp() {
  renderStatus(
    'FarmProを起動しています',
    '端末内データを準備しています…',
  );

  try {
    await initializeFarmProStorage('1.6.0');
    renderApp();
  } catch (error) {
    console.error('IndexedDBの初期化に失敗しました。', error);

    renderStatus(
      'FarmProを起動できませんでした',
      '端末内データの準備に失敗しました。画面を再読み込みしてください。',
    );
  }
}

void startApp();
