import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.farmpro.app',
  appName: 'FarmPro',
  webDir: 'dist',
  // Ship the application in the bundle. No server.url / live-reload endpoint.
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: { contentInset: 'automatic', backgroundColor: '#f5f7fb' },
  plugins: {
    // Only the explicit FarmPro API adapter uses native HTTP.
    CapacitorHttp: { enabled: false },
  },
};

export default config;
