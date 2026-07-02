import { Router } from 'express';
import { createSchedule, deleteSchedule, findSchedule, listSchedules, updateSchedule } from '../scheduleStore';

export const schedulesRouter = Router();

schedulesRouter.get('/', async (_req, res) => {
  res.json(await listSchedules());
});

schedulesRouter.get('/:id', async (req, res) => {
  const schedule = await findSchedule(Number(req.params.id));
  if (!schedule) {
    res.status(404).json({ message: '予定が見つかりません' });
    return;
  }
  res.json(schedule);
});

schedulesRouter.post('/', async (req, res) => {
  const { scheduleType, title, dueDate } = req.body;
  if (!scheduleType || !title || !dueDate) {
    res.status(400).json({ message: '予定区分、タイトル、予定日は必須です' });
    return;
  }
  res.status(201).json(await createSchedule(req.body));
});

schedulesRouter.put('/:id', async (req, res) => {
  const { scheduleType, title, dueDate } = req.body;
  if (!scheduleType || !title || !dueDate) {
    res.status(400).json({ message: '予定区分、タイトル、予定日は必須です' });
    return;
  }
  const schedule = await updateSchedule(Number(req.params.id), req.body);
  if (!schedule) {
    res.status(404).json({ message: '予定が見つかりません' });
    return;
  }
  res.json(schedule);
});

schedulesRouter.delete('/:id', async (req, res) => {
  const deleted = await deleteSchedule(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ message: '予定が見つかりません' });
    return;
  }
  res.status(204).send();
});
