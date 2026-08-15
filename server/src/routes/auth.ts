import { Router, type Request } from 'express';
import { authenticate, createToken } from '../authStore';
import { requireAuth } from '../authMiddleware';

export const authRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

type LoginAttemptState = {
  failedAttempts: number;
  windowStartedAt: number;
  locked