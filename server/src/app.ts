import { stripePortalRouter } from './routes/stripePortal';
import { lineSessionRouter } from './routes/lineSession';
import { linePreviewSignupRouter } from './routes/linePreviewSignup';
import { linePreviewSignupPageRouter } from './routes/linePreviewSignupPage';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cattleRouter } from './routes/cattle';
import { calvesRouter } from './routes/calves';
import { breedingsRouter } from './routes/breedings';
import { vaccinesRouter } from './routes/vaccines';
import { blvTestsRouter } from './routes/blvTests';
import { dashboardRouter } from './routes/dashboard';
import { schedulesRouter } from './routes/schedules';
import { treatmentsRouter } from './routes/treatments';
import { reportsRouter } from './routes/reports';
import { backupsRouter } from './routes/backups';
import { cloudSnapshotsRouter } from './routes/cloudSnapshots';
import salesRouter from './routes/sales';
import expensesRouter from './routes/expenses';
import { monthlyBalanceRouter } from './routes/monthlyBalance';
import { feedingsRouter } from './routes/feedings';
import { feedInventoryRouter } from './routes/feedInventory';
import { feedingAlertActionsRouter } from './routes/feedingAlertActions';
import { feedingGuideRouter } from './routes/feedingGuide';
import { calvingsRouter } from './routes/calvings';
import { marketShippingPlanRouter } from './routes/marketShippingPlan';
import { farmSettingsRouter } from './routes/farmSettings';
import { alertSettingsRouter } from './routes/alertSettings';
import { pushNotificationsRouter } from './routes/pushNotifications';
import settingsRouter from './routes/settings';
import { mastersRouter } from './routes/masters';
import { authRouter } from './routes/auth';
import { passwordResetRouter } from './routes/passwordReset';
import { cattleDocumentAiRouter } from './routes/cattleDocumentAi';
import { farmAiRouter } from './routes/farmAi';
import { fieldRecordAiRouter } from './routes/fieldRecordAi';
import { bankTransferApplicationsRouter } from './routes/bankTransferApplications';
import { operatorUsersRouter } from './routes/operatorUsers';
import { withdrawalRequestsRouter } from './routes/withdrawalRequests';
import { accountWithdrawalsRouter } from './routes/accountWithdrawals';
import { resumeAccountWithdrawals } from './accountWithdrawalStore';
import { requireAuth } from './authMiddleware';
import { requireOperator } from './operatorAccess';
import { normalizeLegacyReportFields } from './normalizeLegacyData';
import { stripeWebhookHandler, getActiveSubscriptionSummary } from './stripeWebhook';
import { updateUserPlanById } from './authStore';
import { runAutomaticPushAlertCheck } from './automaticPushAlerts';
import {
  expireEndedBankTransferContracts,
  expireOverdueBankTransferApplications,
  getActiveBankTransferSummary,
} from './bankTransferApplicationStore';

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(currentDir, '../../client/dist');
const HOURLY_CHECK_INTERVAL_MS = 60 * 60 * 1000;

if (isProduction) {
  app.set('trust proxy', 1);
}

function requiredProductionValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

const productionOrigin =
  process.env.FARMPRO_ALLOWED_ORIGIN?.trim() ||
  process.env.RENDER_EXTERNAL_URL?.trim();

const allowedOrigin = isProduction
  ? productionOrigin || requiredProductionValue('FARMPRO_ALLOWED_ORIGIN')
  : process.env.FARMPRO_ALLOWED_ORIGIN?.trim() || true;

if (isProduction) {
  requiredProductionValue('FARMPRO_AUTH_SECRET');
  requiredProductionValue('FARMPRO_DATA_DIR');
}

normalizeLegacyReportFields();

// Restrict an isolated settlement preview before any side-effecting route.
// Normal FarmPro deployments never enter this middleware.
if (process.env.RENDER_SERVICE_NAME === 'farmpro-settlement-sandbox' &&
    isProduction &&
    process.env.FARMPRO_DATA_DIR?.startsWith('/tmp/farmpro-settlement-sandbox')) {
  app.use((req, res, next) => {
    const allowed =
      (req.method === 'GET' && req.path === '/api/health') ||
      (req.method === 'POST' && req.path === '/api/auth/login') ||
      (req.method === 'GET' && req.path === '/api/auth/me') ||
      (req.method === 'GET' && (req.path === '/api/sales/record-sync' ||
        req.path.startsWith('/api/expenses/settlement-sync/') ||
        req.path === '/api/expenses/record-sync')) ||
      (req.method === 'POST' && req.path === '/api/expenses/settlement-sync') ||
      (req.method === 'POST' && req.path.startsWith('/api/sales/preview-import-sale/'));
    if (!allowed && req.path.startsWith('/api/')) {
      res.status(403).json({ message: 'この操作は販売精算の検証環境では利用できません' });
      return;
    }
    next();
  });
}

app.use(cors({ origin: allowedOrigin }));
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.16.0-render-single-service' });
});
// Full-app LINE authentication is opt-in on a separately provisioned preview only.
// It is never enabled on the production or legacy LINE preview hosts.
const fullAppLinePreview = process.env.FARMPRO_LINE_FULL_APP_PREVIEW === 'true';
const lineSignupProduction = process.env.FARMPRO_LINE_SIGNUP_PRODUCTION === 'true';
if (fullAppLinePreview && lineSignupProduction) throw new Error('LINE_SIGNUP_MODE_CONFLICT');
if (fullAppLinePreview || lineSignupProduction) {
  const origin = process.env.FARMPRO_ALLOWED_ORIGIN?.trim() || '';
  const callback = process.env.LINE_LOGIN_CALLBACK_URL?.trim() || '';
  const dataDir = process.env.FARMPRO_DATA_DIR?.trim() || '';
  const bannedHosts = ['app.farmpro-app.jp', 'farmpro-line-test.onrender.com', 'farmpro-line-preview.onrender.com'];
  let originUrl: URL;
  let callbackUrl: URL;
  try { originUrl = new URL(origin); callbackUrl = new URL(callback); }
  catch { throw new Error('LINE_FULL_APP_PREVIEW_URLS_REQUIRED'); }
  const deployedUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  // Render's default onrender.com URL can differ from the production custom domain.
  // Enforce exact deployment origin for isolated previews only; production is
  // independently pinned to app.farmpro-app.jp by the explicit gate below.
  if (fullAppLinePreview && deployedUrl && new URL(deployedUrl).origin !== originUrl.origin) {
    throw new Error('LINE_FULL_APP_PREVIEW_DEPLOYMENT_ORIGIN_MISMATCH');
  }
  if (originUrl.protocol !== 'https:' || callbackUrl.protocol !== 'https:' ||
      originUrl.pathname !== '/' || originUrl.search || originUrl.hash ||
      callbackUrl.origin !== originUrl.origin || callbackUrl.pathname !== '/api/auth/line/callback' ||
      callbackUrl.search || callbackUrl.hash || (fullAppLinePreview && bannedHosts.includes(originUrl.hostname.toLowerCase())) ||
      (lineSignupProduction && (originUrl.hostname !== 'app.farmpro-app.jp' || !isProduction)) ||
      !dataDir || (fullAppLinePreview && dataDir === '/var/data/farmpro') || !process.env.FARMPRO_AUTH_SECRET?.trim() ||
      process.env.FARMPRO_LINE_ISOLATED_PREVIEW === 'true') {
    throw new Error('LINE_FULL_APP_PREVIEW_ISOLATION_REQUIRED');
  }
  app.use('/api/auth/line', lineSessionRouter);
  app.use('/api/auth/line', linePreviewSignupRouter);
  app.use(linePreviewSignupPageRouter);
}
app.use('/api/auth/password-reset', passwordResetRouter);
app.use('/api/auth', authRouter);

// AI帳票解析は候補作成のみで、FarmProデータはこのルートでは保存しない。
// 現行の取り込み画面から利用するため、通常API認証より前に配置する。
app.use('/api/cattle-document-ai', cattleDocumentAiRouter);

app.use('/api/account-withdrawals', accountWithdrawalsRouter);
app.use('/api', requireAuth);
app.use('/api/billing', stripePortalRouter);

app.get('/api/operator/access', requireOperator, (_req, res) => {
  res.json({ operator: true });
});
app.use('/api/bank-transfer-applications', bankTransferApplicationsRouter);
app.use('/api/operator/users', operatorUsersRouter);
app.use('/api/withdrawal-requests', withdrawalRequestsRouter);
app.use('/api/farm-ai', farmAiRouter);
app.use('/api/field-record-ai', fieldRecordAiRouter);
app.use('/api/cattle', cattleRouter);
app.use('/api/calves', calvesRouter);
app.use('/api/breedings', breedingsRouter);
app.use('/api/vaccines', vaccinesRouter);
app.use('/api/blv-tests', blvTestsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/cloud-snapshots', cloudSnapshotsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/monthly-balance', monthlyBalanceRouter);
app.use('/api/feedings', feedingsRouter);
app.use('/api/feed-inventory', feedInventoryRouter);
app.use('/api/feeding-guide', feedingGuideRouter);
app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
app.use('/api/calvings', calvingsRouter);
app.use('/api/market-shipping-plan', marketShippingPlanRouter);
app.use('/api/farm-settings', farmSettingsRouter);
app.use('/api/alert-settings', alertSettingsRouter);
app.use('/api/push-notifications', pushNotificationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/masters', mastersRouter);

if (isProduction) {
  app.use(express.static(clientDistDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

async function runBankTransferExpiryCheck() {
  try {
    const pendingResult = await expireOverdueBankTransferApplications();
    const contractResult = await expireEndedBankTransferContracts();

    for (const userId of contractResult.expiredUserIds) {
      const stripeSubscription = await getActiveSubscriptionSummary(userId);
      const bankSubscription = await getActiveBankTransferSummary(userId);
      const nextPlan = stripeSubscription?.plan || bankSubscription?.plan || 'free';
      await updateUserPlanById(userId, nextPlan);
    }

    if (pendingResult.changed) {
      console.log('FarmPro bank transfer: overdue pending applications were auto-expired');
    }
    if (contractResult.changed) {
      console.log('FarmPro bank transfer: ended yearly contracts were auto-expired and user plans reconciled');
    }
  } catch (error) {
    console.error('FarmPro bank transfer expiry check failed', error);
  }
}

async function runAutomaticPushCheckSafely() {
  try {
    const result = await runAutomaticPushAlertCheck();
    const notifiedFarms = result.notifiedFarms ?? 0;
    if (notifiedFarms > 0) {
      console.log(`FarmPro push: daily alert sent to ${notifiedFarms} farm(s)`);
    }
  } catch (error) {
    console.error('FarmPro push: automatic alert check failed', error);
  }
}

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
  // A settlement preview must not run scheduled withdrawals, billing changes,
  // or push deliveries. The preview bootstrap validates these same boundaries.
  const isolatedSettlementPreview =
    process.env.RENDER_SERVICE_NAME === 'farmpro-settlement-sandbox' &&
    process.env.NODE_ENV === 'production' &&
    process.env.FARMPRO_DATA_DIR?.startsWith('/tmp/farmpro-settlement-sandbox') === true;
  if (isolatedSettlementPreview) {
    console.log('Isolated settlement preview: background account/billing/push tasks disabled');
    return;
  }

  void resumeAccountWithdrawals();
  void runBankTransferExpiryCheck();
  void runAutomaticPushCheckSafely();

  const bankTimer = setInterval(() => {
    void runBankTransferExpiryCheck();
  }, HOURLY_CHECK_INTERVAL_MS);
  bankTimer.unref();

  const pushTimer = setInterval(() => {
    void runAutomaticPushCheckSafely();
  }, HOURLY_CHECK_INTERVAL_MS);
  pushTimer.unref();
});