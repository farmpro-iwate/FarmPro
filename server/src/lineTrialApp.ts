import express from 'express';
import { lineSessionRouter } from './routes/lineSession';
import { linePreviewCompletionRouter } from './routes/linePreviewCompletion';
import { getLineLoginConfig } from './lineLoginOAuth';

/** Isolated LINE login preview. Never imported by the production app. */
if (process.env.FARMPRO_LINE_ISOLATED_PREVIEW !== 'true') {
  throw new Error('LINE_ISOLATED_PREVIEW_DISABLED');
}
if (!process.env.FARMPRO_DATA_DIR?.trim()) {
  throw new Error('LINE_ISOLATED_DATA_DIR_REQUIRED');
}
const callback = process.env.LINE_LOGIN_CALLBACK_URL || '';
if (!callback.startsWith('https://') || new URL(callback).pathname !== '/api/auth/line/callback') {
  throw new Error('LINE_ISOLATED_CALLBACK_REQUIRED');
}
const callbackHost = new URL(callback).hostname.toLowerCase();
if (callbackHost === 'app.farmpro-app.jp' || callbackHost === 'farmpro-line-test.onrender.com') {
  throw new Error('LINE_ISOLATED_CALLBACK_HOST_FORBIDDEN');
}
if (process.env.FARMPRO_DATA_DIR?.trim() === '/var/data/farmpro') {
  throw new Error('LINE_ISOLATED_DATA_DIR_REUSE_FORBIDDEN');
}
if (!getLineLoginConfig() || !process.env.FARMPRO_AUTH_SECRET?.trim()) {
  throw new Error('LINE_ISOLATED_AUTH_CONFIG_REQUIRED');
}
const app = express();
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'line-isolated-preview' }));
app.use(express.json({limit:'16kb'}));
app.use('/api/auth/line', lineSessionRouter);
app.use(linePreviewCompletionRouter);
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LINE_ISOLATED_PORT_INVALID');
app.listen(port, '0.0.0.0', () => {
  console.info('Isolated LINE login preview listening on', port);
});
