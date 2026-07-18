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
import salesRouter from './routes/sales';
import expensesRouter from './routes/expenses';
import { monthlyBalanceRouter } from './routes/monthlyBalance';
import { feedingsRouter } from './routes/feedings';
import { feedInventoryRouter } from './routes/feedInventory';
import { feedingAlertActionsRouter } from './routes/feedingAlertActions';
import { feedingGuideRouter } from './routes/feedingGuide';
import { calvingsRouter } from './routes/calvings';
import settingsRouter from './routes/settings';
import { mastersRouter } from './routes/masters';
import { authRouter } from './routes/auth';
import { requireAuth } from './authMiddleware';
import { normalizeLegacyReportFields } from './normalizeLegacyData';

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDistDir = path.resolve(currentDir, '../../client/dist');

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

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.16.0-render-single-service' });
});
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

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
app.use('/api/sales', salesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/monthly-balance', monthlyBalanceRouter);
app.use('/api/feedings', feedingsRouter);
app.use('/api/feed-inventory', feedInventoryRouter);
app.use('/api/feeding-guide', feedingGuideRouter);
app.use('/api/feeding-alert-actions', feedingAlertActionsRouter);
app.use('/api/calvings', calvingsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/masters', mastersRouter);

if (isProduction) {
  app.use(express.static(clientDistDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});
