import { deleteRecord, getAllRecords, saveRecord } from '../storage/repository';
import type { SynchronizationProgramTemplate } from '../types/schedule';

const STORE_NAME = 'metadata' as const;
const TEMPLATE_PREFIX = 'sync-template-';

function createTemplateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${TEMPLATE_PREFIX}${crypto.randomUUID()}`;
  }
  return `${TEMPLATE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSynchronizationTemplates(): Promise<SynchronizationProgramTemplate[]> {
  const records = await getAllRecords<SynchronizationProgramTemplate>(STORE_NAME);
  return records
    .filter((record) => record.recordType === 'synchronization-program-template')
    .sort((a, b) => a.templateName.localeCompare(b.templateName, 'ja'));
}

export async function saveSynchronizationTemplate(input: {
  templateName: string;
  purpose: SynchronizationProgramTemplate['purpose'];
  steps: SynchronizationProgramTemplate['steps'];
  note?: string;
  id?: string;
}): Promise<SynchronizationProgramTemplate> {
  const record: SynchronizationProgramTemplate = {
    id: input.id || createTemplateId(),
    recordType: 'synchronization-program-template',
    templateName: input.templateName.trim(),
    purpose: input.purpose,
    steps: input.steps.map((step) => ({ ...step })),
    note: input.note?.trim() || '',
  };

  return saveRecord<SynchronizationProgramTemplate>(STORE_NAME, record);
}

export async function deleteSynchronizationTemplate(id: string): Promise<void> {
  await deleteRecord(STORE_NAME, id);
}
