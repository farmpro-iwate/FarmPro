import { Router } from 'express';
import { createSchedule, deleteSchedule, findSchedule, listSchedules, updateSchedule } from '../scheduleStore';
import { listSyncedSchedules, syncSchedule } from '../scheduleSyncStore';

export const schedulesRouter = Router();

schedulesRouter.get('/record-sync', async (_req, res) => {
  res.json(await listSyncedSchedules());
});

schedulesRouter.put('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  try {
    res.json(await syncSchedule(id, { ...req.body, id }));
  } catch {
    res.status(400).json({ message: '予定記録の同期に失敗しました' });
  }
});

schedulesRouter.delete('/record-sync/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ message: '同期データが不正です' });
    return;
  }

  const deletedAt = new Date().toISOString();

  try {
    res.json(await syncSchedule(id, { id, deletedAt }));
  } catch {
    res.status(400).json({ message: '予定記録の削除同期に失敗しました' });
  }
});

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
