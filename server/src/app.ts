import express from 'express';
import cors from 'cors';
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


const app = express();
const port = 4000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.11.0-backup' });
});

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

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});
