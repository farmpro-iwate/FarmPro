/** Capacitor's bundled iOS WebView uses capacitor://localhost. Do not classify Safari by user agent. */
export function isIosCapacitorRuntime(protocol: string): boolean {
  return protocol === 'capacitor:';
}
