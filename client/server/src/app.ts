import express from 'express';
import cors from 'cors';
import { cattleRouter } from './routes/cattle';
import { calvesRouter } from './routes/calves';
import { breedingsRouter } from './routes/breedings';
import { vaccinesRouter } from './routes/vaccines';

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.4.0-vaccine' });
});

app.use('/api/cattle', cattleRouter);
app.use('/api/calves', calvesRouter);
app.use('/api/breedings', breedingsRouter);
app.use('/api/vaccines', vaccinesRouter);

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});
