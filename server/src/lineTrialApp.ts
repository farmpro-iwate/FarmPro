import express from 'express';
import { lineSessionRouter } from './routes/lineSession';

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
const app = express();
app.use(express.json({limit:'16kb'}));
app.use('/api/auth/line', lineSessionRouter);
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LINE_ISOLATED_PORT_INVALID');
app.listen(port, '0.0.0.0', () => {
  console.info('Isolated LINE login preview listening on', port);
});
