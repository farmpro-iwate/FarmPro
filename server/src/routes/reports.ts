import { Router } from 'express';
import { getCsv, getReportSummary } from '../reportStore';

export const reportsRouter = Router();

reportsRouter.get('/summary', async (_req, res) => {
  res.json(await getReportSummary());
});

reportsRouter.get('/csv/:kind', async (req, res) => {
  const csv = await getCsv(req.params.kind);
  if (csv === null) {
    res.status(404).json({ message: 'CSV種別が見つかりません' });
    return;
  }

  const fileName = `farmpro-${req.params.kind}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send('\uFEFF' + csv);
});
