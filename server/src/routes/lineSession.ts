import { Router } from 'express';
import { getLineLoginConfig } from '../lineLoginOAuth';
import { lineSessionStartRouter } from './lineSessionStart';
import { lineSessionCallbackRouter } from './lineSessionCallback';
import { lineSessionFinishRouter } from './lineSessionFinish';

/**
 * LINE OAuth login-only flow. Explicit opt-in mounting is required.
 * Do not enable until callback URI, single-writer data storage, LINE channel
 * readiness, and browser end-to-end checks have been reviewed.
 * LINE Free registration remains separately disabled.
 */
export const lineSessionRouter = Router();
lineSessionRouter.get('/availability', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ available: Boolean(getLineLoginConfig()) });
});
lineSessionRouter.use(lineSessionStartRouter);
lineSessionRouter.use(lineSessionCallbackRouter);
lineSessionRouter.use(lineSessionFinishRouter);
