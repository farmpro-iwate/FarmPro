import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#2e7d32' },
    secondary: { main: '#795548' },
    background: { default: '#f6f8f5' }
  },
  typography: {
    fontFamily: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'].join(','),
    button: { fontWeight: 700 }
  },
  shape: { borderRadius: 14 }
});
