import { getAuthToken } from './authClient';

export type FarmProDeviceNotificationStatus = 'unsupported' | NotificationPermission;

const NOTIFIED_KEY_PREFIX = 'farmpro-device-notified:';

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function authHeaders() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function getDeviceNotificationStatus(): FarmProDeviceNotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function registerServerPushSubscription() {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  const keyResponse = await fetch('/api/push-notifications/vapid-public-key', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!keyResponse.ok) throw new Error('プッシュ通知の公開鍵を取得できませんでした');
  const { publicKey } = await keyResponse.json() as { publicKey?: string };
  if (!publicKey) throw new Error('プッシュ通知の公開鍵がありません');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const response = await fetch('/api/push-notifications/subscribe', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error('プッシュ通知の端末登録に失敗しました');
  return true;
}

export async function sendServerPushTest() {
  const response = await fetch('/api/push-notifications/test', {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message || 'テスト通知の送信に失敗しました');
  }
  return response.json() as Promise<{ sent: number }>;
}

export async function requestDeviceNotificationPermission(): Promise<FarmProDeviceNotificationStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  await showDeviceNotification('FarmProの通知を許可しました', {
    body: '重要なアラートを端末通知で確認できます。',
    url: '/alerts',
    tag: 'farmpro-notification-enabled',
  });

  try {
    await registerServerPushSubscription();
  } catch (error) {
    console.warn('FarmProのサーバープッシュ登録をスキップしました。', error);
  }

  return permission;
}

export async function showDeviceNotification(
  title: string,
  options: { body: string; url?: string; tag?: string },
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body,
      icon: '/farmpro-apple-touch-icon.png',
      badge: '/farmpro-apple-touch-icon.png',
      tag: options.tag,
      data: { url: options.url || '/alerts' },
    });
    return true;
  }

  new Notification(title, { body: options.body });
  return true;
}

export async function notifyFarmAlertOncePerDay(input: {
  id: string;
  title: string;
  body: string;
  url?: string;
}) {
  if (getDeviceNotificationStatus() !== 'granted') return false;

  const today = new Date().toISOString().slice(0, 10);
  const key = `${NOTIFIED_KEY_PREFIX}${today}:${input.id}`;
  if (localStorage.getItem(key)) return false;

  const shown = await showDeviceNotification(input.title, {
    body: input.body,
    url: input.url || '/alerts',
    tag: `farmpro-alert-${input.id}`,
  });

  if (shown) localStorage.setItem(key, '1');
  return shown;
}
