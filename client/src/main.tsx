import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App';
import './print.css';
import './responsiveTables.css';

const theme = createTheme({
  palette: { primary: { main: '#2e7d32' } },
  shape: { borderRadius: 12 },
  typography: {
    h4: { fontSize: 'clamp(1.45rem, 4vw, 2rem)' },
    h5: { fontSize: 'clamp(1.25rem, 3.5vw, 1.6rem)' }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);

