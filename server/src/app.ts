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

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.9.0-treatment' });
});

app.use('/api/cattle', cattleRouter);
app.use('/api/calves', calvesRouter);
app.use('/api/breedings', breedingsRouter);
app.use('/api/vaccines', vaccinesRouter);
app.use('/api/blv-tests', blvTestsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/treatments', treatmentsRouter);

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});
