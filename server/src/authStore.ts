import crypto from 'node:crypto';
import { readJson, writeJson } from './jsonStore';

export type FarmProUser = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  role: 'owner' | 'member';
  active: boolean;
};

export type AuthUser = Omit<FarmProUser, 'passwordSalt' | 'passwordHash'>;

type TokenPayload = {
  user