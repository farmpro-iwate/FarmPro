import express from 'express';
import cors from 'cors';
import cattleRouter from './routes/cattle';
import calvesRouter from './routes/calves';
import breedingsRouter from './routes/breedings';
import vaccinesRouter from './routes/vaccines';
import blvRouter from './routes/blv';
import schedulesRouter from './routes/schedules';
import treatmentsRouter from './routes/treatments';
import dashboardRouter from './routes/dashboard';
import reportsRouter from './routes/reports';
import backupsRouter from './routes/backups';
import settingsRouter from './routes/settings';
import salesRouter from './routes/sales';
import mastersRouter from './routes/masters';

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'FarmPro' });
});

app.use('/api/cattle', cattleRouter);
app.use('/api/calves', calvesRouter);
app.use('/api/breedings', breedingsRouter);
app.use('/api/vaccines', vaccinesRouter);
app.use('/api/blv', blvRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/treatments', treatmentsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/masters', mastersRouter);

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});