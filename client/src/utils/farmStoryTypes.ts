import type { FarmStoryCategoryId } from '../services/farmStoryDisplaySettings';

export type FarmStoryItem = {
  id: string;
  date: string;
  categoryId: FarmStoryCategoryId;
  category: string;
  title: string;
  detail: string;
  animalKind?: 'cattle' | 'calf';
  animalId?: string | number;
  animalName?: string;
  earTag?: string;
  birthday?: string;
  sourcePath?: string;
};
