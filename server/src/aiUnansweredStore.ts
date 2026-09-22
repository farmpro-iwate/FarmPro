import { readJson, writeJson } from './jsonStore';

export type AiUnansweredReason =
  | 'unsupported-question'
  | 'ai-error';

export type AiUnansweredLog = {
  id: string;
  question: string;
  reason: AiUnansweredReason;
  detail: string;
  createdAt: string;
};

const fileName = 'ai-unanswered-questions.json';

export async function listAiUnansweredLogs() {
  const logs = await readJson<AiUnansweredLog[]>(fileName, []);
  return [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function recordAiUnansweredQuestion(input: {
  question: string;
  reason: AiUnansweredReason;
  detail?: string;
}) {
  const question = input.question.trim();
  if (!question) return null;

  const logs = await readJson<AiUnansweredLog[]>(fileName, []);
  const now = new Date().toISOString();
  const log: AiUnansweredLog = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    question,
    reason: input.reason,
    detail: String(input.detail || '').trim(),
    createdAt: now,
  };

  logs.push(log);

  // Keep the log useful without allowing an unbounded local JSON file.
  const capped = logs
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-1000);

  await writeJson(fileName, capped);
  return log;
}
