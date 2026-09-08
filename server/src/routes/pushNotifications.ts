import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';

const router = Router();

type ClientPushSubscription = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type SavedSubscription = {
  farmId: string;
  userId: string;
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
};

type SubscriptionFile = {
  subscriptions: SavedSubscription[];
};

type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

const dataDir = process.env.FARMPRO_DATA_DIR?.trim() || path.resolve(process.cwd(), 'data');
const subscriptionFile = path.join(dataDir, 'push-subscriptions.json');
const vapidFile = path.join(dataDir, 'push-vapid-keys.json');

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile<T>(file: string, value: T) {
  await ensureDataDir();
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}

async function getVapidKeys(): Promise<VapidKeys> {
  const existing = await readJsonFile<VapidKeys | null>(vapidFile, null);
  if (existing?.publicKey && existing?.privateKey) return existing;

  const generated = webpush.generateVAPIDKeys();
  const keys = { publicKey: generated.publicKey, privateKey: generated.privateKey };
  await writeJsonFile(vapidFile, keys);
  return keys;
}

async function configureWebPush() {
  const keys = await getVapidKeys();
  webpush.setVapidDetails('mailto:support@farmpro-app.jp', keys.publicKey, keys.privateKey);
  return keys;
}

async function readSubscriptions() {
  return readJsonFile<SubscriptionFile>(subscriptionFile, { subscriptions: [] });
}

async function saveSubscriptions(value: SubscriptionFile) {
  await writeJsonFile(subscriptionFile, value);
}

function getAuthContext(res: any) {
  const user = res.locals.authUser;
  if (!user?.id || !user?.farmId) throw new Error('AUTH_CONTEXT_MISSING');
  return { userId: String(user.id), farmId: String(user.farmId) };
}

export async function getSubscribedFarmIds() {
  const file = await readSubscriptions();
  return Array.from(new Set(file.subscriptions.map((item) => item.farmId).filter(Boolean)));
}

export async function sendPushToFarm(farmId: string, input: PushPayload) {
  await configureWebPush();
  const file = await readSubscriptions();
  const targets = file.subscriptions.filter((item) => item.farmId === farmId);

  if (targets.length === 0) return { sent: 0, missing: true };

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url || '/alerts',
    tag: input.tag || 'farmpro-alert-summary',
  });

  const expiredEndpoints = new Set<string>();
  let sent = 0;

  await Promise.all(targets.map(async (item) => {
    try {
      await webpush.sendNotification({
        endpoint: item.endpoint,
        keys: item.keys,
      }, payload);
      sent += 1;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        expiredEndpoints.add(item.endpoint);
        return;
      }
      throw error;
    }
  }));

  if (expiredEndpoints.size > 0) {
    file.subscriptions = file.subscriptions.filter((item) => !expiredEndpoints.has(item.endpoint));
    await saveSubscriptions(file);
  }

  return { sent, missing: false };
}

async function sendTestPushForFarm(farmId: string) {
  return sendPushToFarm(farmId, {
    title: 'FarmPro テスト通知',
    body: 'FarmProを閉じていても受け取れるプッシュ通知のテストです。',
    url: '/alerts',
    tag: 'farmpro-server-push-test',
  });
}

router.get('/vapid-public-key', async (_req, res) => {
  try {
    const keys = await configureWebPush();
    res.json({ publicKey: keys.publicKey });
  } catch (error) {
    console.error('FarmPro push: VAPID key load failed', error);
    res.status(500).json({ message: '通知設定の準備に失敗しました' });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { userId, farmId } = getAuthContext(res);
    const subscription = req.body as ClientPushSubscription;
    const endpoint = String(subscription?.endpoint || '').trim();
    const p256dh = String(subscription?.keys?.p256dh || '').trim();
    const auth = String(subscription?.keys?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ message: '通知購読情報が不足しています' });
      return;
    }

    const file = await readSubscriptions();
    const now = new Date().toISOString();
    const next: SavedSubscription = {
      farmId,
      userId,
      endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: { p256dh, auth },
      createdAt: now,
      updatedAt: now,
    };

    const index = file.subscriptions.findIndex((item) => item.endpoint === endpoint);
    if (index >= 0) {
      next.createdAt = file.subscriptions[index].createdAt || now;
      file.subscriptions[index] = next;
    } else {
      file.subscriptions.push(next);
    }

    await saveSubscriptions(file);
    res.json({ subscribed: true });
  } catch (error) {
    console.error('FarmPro push: subscription save failed', error);
    res.status(500).json({ message: '通知購読の保存に失敗しました' });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { farmId } = getAuthContext(res);
    const requestedDelay = Number(req.body?.delaySeconds ?? 0);
    const delaySeconds = Number.isFinite(requestedDelay)
      ? Math.min(30, Math.max(0, Math.round(requestedDelay)))
      : 0;

    if (delaySeconds > 0) {
      setTimeout(() => {
        void sendTestPushForFarm(farmId).catch((error) => {
          console.error('FarmPro push: delayed test send failed', error);
        });
      }, delaySeconds * 1000);

      res.json({ scheduled: true, delaySeconds });
      return;
    }

    const result = await sendTestPushForFarm(farmId);
    if (result.missing) {
      res.status(404).json({ message: 'この端末のプッシュ通知登録がありません' });
      return;
    }

    res.json({ sent: result.sent });
  } catch (error) {
    console.error('FarmPro push: test send failed', error);
    res.status(500).json({ message: 'テスト通知の送信に失敗しました' });
  }
});

export { router as pushNotificationsRouter };
