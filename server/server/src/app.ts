import express from 'express';
import cors from 'cors';
import { cattleRouter } from './routes/cattle';

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: '繁殖Farm Pro', version: '1.1.1-json' });
});

app.use('/api/cattle', cattleRouter);

app.listen(port, () => {
  console.log(`FarmPro server running at http://localhost:${port}`);
});
