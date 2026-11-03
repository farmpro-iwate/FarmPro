import type { AnimalLifecycle } from '../types/animalLifecycle';
import { getAnimalLifecycleLabel } from './animalLifecycle';

export type LifecycleDisplayAnimal = { lifecycle?: AnimalLifecycle; managementStatus?: string };

export const animalLifecycleLabel = getAnimalLifecycleLabel;
