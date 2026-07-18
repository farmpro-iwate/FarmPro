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
  userId: string;
  farmId: string;
  expiresAt: number;
};

const USERS_FILE = 'users.json';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_EMAIL = 'demo@farmpro.local';
const DEFAULT_PASSWORD = 'password';

function secret() {
  return process.env.FARMPRO_AUTH_SECRET?.trim() || 'farmpro-development-secret-change-me';
}

function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function safeUser(user: FarmProUser): AuthUser {
  const { passwordSalt: _passwordSalt, passwordHash: _passwordHash, ...result } = user;
  return result;
}

async function ensureDefaultUser() {
  const users = await readJson<FarmProUser[]>(USERS_FILE, []);
  if (users.length > 0) return users;

  const salt = crypto.randomBytes(16).toString('hex');
  const defaultUser: FarmProUser = {
    id: crypto.randomUUID(),
    farmId: 'farm-demo',
    farmName: 'FarmPro試用農場',
    name: '試用利用者',
    email: DEFAULT_EMAIL,
    passwordSalt: salt,
    passwordHash: hashPassword(DEFAULT_PASSWORD, salt),
    role: 'owner',
    active: true
  };
  await writeJson(USERS_FILE, [defaultUser]);
  return [defaultUser];
}

export async function authenticate(email: string, password: string) {
  const users = await ensureDefaultUser();
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find((item) => item.active && item.email.toLowerCase() === normalizedEmail);
  if (!user) return null;

  const actual = Buffer.from(hashPassword(password, user.passwordSalt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  return safeUser(user);
}

export function createToken(user: AuthUser) {
  const payload: TokenPayload = {
    userId: user.id,
    farmId: user.farmId,
    expiresAt: Date.now() + TOKEN_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export async function verifyToken(token: string) {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as TokenPayload;
    if (payload.expiresAt <= Date.now()) return null;
    const users = await ensureDefaultUser();
    const user = users.find((item) => item.active && item.id === payload.userId && item.farmId === payload.farmId);
    return user ? safeUser(user) : null;
  } catch {
    return null;
  }
}
