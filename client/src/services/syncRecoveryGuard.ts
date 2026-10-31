/** The recovery barrier is local to a farm and never changes its cloud data. */
export type RecoveryStoragePermit = { farmId: string; userId: string };
export type RecoveryIdentity = RecoveryStoragePermit & { token: string };
export type RecordSyncLease = { assertCurrent(): void };
export type CloudRecoveryLease = RecoveryIdentity & RecordSyncLease & { release(): void };

const PAUSE_PREFIX = 'farmpro.cloudRecoveryPaused.';
const BASELINE_PREFIX = 'farmpro.recoveryRecordBaseline.';
type PauseMarker = { owner: string; userId: string; startedAt: string };
type Baseline = { version: 1; farmId: string; records: Record<string, Record<string, string>> };
let activeRecovery: { lease: CloudRecoveryLease; owner: string } | null = null;
let baselineFailureFarm: string | null = null;
let cachedBaseline: { farmId: string; raw: string; value: Baseline } | null = null;

function scopedKey(prefix: string, farmId: string): string {
  return `${prefix}${encodeURIComponent(farmId)}`;
}

// These are the same session keys used by authClient. Reading them here avoids
// a storage/auth/recovery import cycle and never writes or refreshes a session.
function currentIdentity(): RecoveryIdentity | null {
  const raw = window.localStorage.getItem('farmpro.authUser');
  const token = window.localStorage.getItem('farmpro.authToken')?.trim() || '';
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as { id?: unknown; farmId?: unknown };
    const userId = typeof user.id === 'string' ? user.id.trim() : '';
    const farmId = typeof user.farmId === 'string' ? user.farmId.trim() : '';
    return farmId && userId ? { farmId, userId, token } : null;
  } catch {
    return null;
  }
}

function assertIdentity(identity: RecoveryIdentity | null): void {
  const current = currentIdentity();
  if (current?.farmId !== identity?.farmId || current?.userId !== identity?.userId ||
      current?.token !== identity?.token) {
    throw new Error('ログイン中の農場が変わったため、同期処理を中止しました。');
  }
}

function pauseMarker(farmId: string): PauseMarker | null {
  const raw = window.localStorage.getItem(scopedKey(PAUSE_PREFIX, farmId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PauseMarker;
    if (!value.owner || !value.userId) throw new Error();
    return value;
  } catch {
    throw new Error('復旧の停止状態を確認できません。同期画面で復旧を再開してください。');
  }
}

export function isCloudRecoveryPaused(): boolean {
  const identity = currentIdentity();
  return Boolean(identity && (baselineFailureFarm === identity.farmId ||
    window.localStorage.getItem(scopedKey(PAUSE_PREFIX, identity.farmId))));
}

export function assertCloudWriteAllowed(): void {
  if (isCloudRecoveryPaused()) {
    throw new Error('クラウド正本の受信を確認中です。通常の保存・同期は一時停止しています。');
  }
}

export function assertRecoveryStorageAccess(permit?: RecoveryStoragePermit): void {
  if (permit) {
    if (!activeRecovery || activeRecovery.lease !== permit) {
      throw new Error('この復旧処理のデータ操作権限を確認できません。');
    }
    activeRecovery.lease.assertCurrent();
    return;
  }
  assertCloudWriteAllowed();
}

function lockName(farmId: string): string {
  return `farmpro:cloud-recovery:${encodeURIComponent(farmId)}`;
}

/** Includes the complete read/merge/write operation, not only its HTTP request. */
export async function withRecordSync<T>(
  work: (lease: RecordSyncLease) => Promise<T>,
  recoveryPermit?: RecoveryStoragePermit,
): Promise<T> {
  if (recoveryPermit) {
    assertRecoveryStorageAccess(recoveryPermit);
    const lease = activeRecovery!.lease;
    const result = await work(lease);
    lease.assertCurrent();
    return result;
  }
  const identity = currentIdentity();
  const lease: RecordSyncLease = {
    assertCurrent() { assertIdentity(identity); assertCloudWriteAllowed(); },
  };
  lease.assertCurrent();
  const run = async () => {
    lease.assertCurrent();
    const result = await work(lease);
    lease.assertCurrent();
    return result;
  };
  // A recovered device cannot safely fall back to uncoordinated syncing. Older
  // devices that never opted into recovery retain their existing behaviour.
  if (!globalThis.navigator?.locks && identity?.farmId && window.localStorage.getItem(
    scopedKey('farmpro.recoveredSyncBase.', identity.farmId),
  )) throw new Error('このブラウザでは復旧後の安全な同期制御を確認できません。通常同期を停止しました。');
  if (!identity?.farmId || !globalThis.navigator?.locks) return run();
  // Both snapshot operations and complete per-record merges use this same lock.
  // A late response may otherwise overwrite a snapshot restored while it waited.
  return navigator.locks.request(lockName(identity.farmId), { mode: 'exclusive' }, run);
}

/** A write started before recovery is drained through its complete response. */
export function recoveryAwareFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const current = currentIdentity();
  const bearer = new Headers(init.headers).get('Authorization');
  if (current?.token && bearer && bearer !== `Bearer ${current.token}`) {
    return Promise.reject(new Error('ログイン情報が変わったため、以前の農場への送信を中止しました。'));
  }
  return withRecordSync(async lease => {
    const response = await fetch(input, init);
    // Drain the network body without consuming the caller's JSON response.
    // Lightweight test doubles may omit clone; a browser Response always has it.
    if (typeof response.clone === 'function') await response.clone().arrayBuffer();
    lease.assertCurrent();
    return response;
  });
}

/** A stale durable marker can be reclaimed only after obtaining its farm lock. */
export async function beginCloudRecovery(): Promise<CloudRecoveryLease> {
  const identity = currentIdentity();
  if (!identity?.token) throw new Error('クラウド正本の受信にはログインが必要です。');
  if (!globalThis.navigator?.locks) {
    throw new Error('このブラウザでは安全な同時操作制御を確認できません。対応ブラウザで復旧してください。');
  }
  if (activeRecovery) throw new Error('この画面で復旧処理が進行中です。');
  const existing = pauseMarker(identity.farmId);
  const owner = crypto.randomUUID();
  const marker: PauseMarker = { owner, userId: identity.userId, startedAt: new Date().toISOString() };
  const key = scopedKey(PAUSE_PREFIX, identity.farmId);
  if (!existing) window.localStorage.setItem(key, JSON.stringify(marker));
  let unlock!: () => void;
  const released = new Promise<void>(resolve => { unlock = resolve; });
  let resolveLease!: (lease: CloudRecoveryLease) => void;
  let rejectLease!: (error: unknown) => void;
  const acquired = new Promise<CloudRecoveryLease>((resolve, reject) => { resolveLease = resolve; rejectLease = reject; });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  const options: LockOptions = existing
    ? { mode: 'exclusive', ifAvailable: true }
    : { mode: 'exclusive', signal: controller.signal };
  void navigator.locks.request(lockName(identity.farmId), options, async lock => {
    window.clearTimeout(timeout);
    if (!lock) throw new Error('別のFarmPro画面で復旧処理が進行中です。');
    assertIdentity(identity);
    if (!existing && pauseMarker(identity.farmId)?.owner !== owner) {
      throw new Error('別の復旧処理を検出しました。同期画面を開き直してください。');
    }
    window.localStorage.setItem(key, JSON.stringify(marker));
    let finished = false;
    const lease: CloudRecoveryLease = {
      ...identity,
      assertCurrent() {
        assertIdentity(identity);
        if (finished || activeRecovery?.lease !== lease || pauseMarker(identity.farmId)?.owner !== owner) {
          throw new Error('復旧処理の状態が変わりました。通常同期は再開していません。');
        }
      },
      release() {
        if (finished) return;
        // The original farm marker is removed only by the owner that set it.
        if (pauseMarker(identity.farmId)?.owner === owner) window.localStorage.removeItem(key);
        finished = true;
        if (baselineFailureFarm === identity.farmId) baselineFailureFarm = null;
        if (activeRecovery?.lease === lease) activeRecovery = null;
        unlock();
      },
    };
    activeRecovery = { lease, owner };
    resolveLease(lease);
    await released;
  }).catch(error => {
    window.clearTimeout(timeout);
    if (!existing && pauseMarker(identity.farmId)?.owner === owner) window.localStorage.removeItem(key);
    rejectLease(error instanceof Error && error.name === 'AbortError'
      ? new Error('実行中の同期が完了しませんでした。データは変更していません。')
      : error);
  });
  return acquired;
}

function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'cloudUpdatedAt' && key !== 'cloudSyncPending')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, comparable(item)]));
}

export function recoveryRecordContent(value: unknown): string {
  return JSON.stringify(comparable(value));
}

function baselineForCurrentFarm(): Baseline | null {
  const identity = currentIdentity();
  if (!identity) return null;
  const raw = window.localStorage.getItem(scopedKey(BASELINE_PREFIX, identity.farmId));
  if (!raw) return null;
  if (cachedBaseline?.farmId === identity.farmId && cachedBaseline.raw === raw) return cachedBaseline.value;
  try {
    const value = JSON.parse(raw) as Baseline;
    if (value.version !== 1 || value.farmId !== identity.farmId || !value.records || typeof value.records !== 'object' ||
        Array.isArray(value.records) || Object.values(value.records).some(records => !records ||
          typeof records !== 'object' || Array.isArray(records) || Object.values(records).some(content => typeof content !== 'string'))) throw new Error();
    cachedBaseline = { farmId: identity.farmId, raw, value };
    return value;
  } catch {
    throw new Error('復旧後の同期基準を読み込めません。既存データを保護して同期を停止しました。');
  }
}

export function setRecoveryRecordBaseline(identity: RecoveryStoragePermit, baseline: Record<string, unknown>): void {
  assertRecoveryStorageAccess(identity);
  const records: Baseline['records'] = {};
  for (const [store, value] of Object.entries(baseline)) {
    if (Array.isArray(value)) {
      records[store] = Object.fromEntries(value.map(record => {
        if (!record || typeof record !== 'object' || !('id' in record) ||
            (typeof record.id !== 'string' && typeof record.id !== 'number')) {
          throw new Error(`${store} の個別同期基準を確認できません。`);
        }
        return [String(record.id), recoveryRecordContent(record)];
      }));
      if (Object.keys(records[store]).length !== value.length) throw new Error(`${store} の同期IDが重複しています。`);
    } else if (value && typeof value === 'object') {
      records[store] = { '$singleton': recoveryRecordContent(value) };
    } else {
      throw new Error(`${store} の個別同期基準を確認できません。`);
    }
  }
  // Quota/security errors deliberately propagate: without this durable baseline
  // the caller must not mark recovery successful or release ordinary syncing.
  window.localStorage.setItem(scopedKey(BASELINE_PREFIX, identity.farmId), JSON.stringify({
    version: 1, farmId: identity.farmId, records,
  } satisfies Baseline));
}

export function shouldApplyRecoveredCloudRecord(store: string, record: unknown): boolean {
  const baseline = baselineForCurrentFarm();
  if (!baseline) return true;
  const records = baseline.records[store];
  if (!records) throw new Error(`${store} の復旧後同期基準がありません。同期を保留しました。`);
  const id = '$singleton' in records ? '$singleton' : String((record as { id?: unknown })?.id ?? '');
  return records[id] !== recoveryRecordContent(record);
}

export function shouldPruneRecoveredCloudRecord(store: string, remoteId: string): boolean {
  const baseline = baselineForCurrentFarm();
  if (!baseline) return true;
  const records = baseline.records[store];
  if (!records) throw new Error(`${store} の復旧後同期基準がありません。同期を保留しました。`);
  return Object.prototype.hasOwnProperty.call(records, remoteId);
}

/** Advance only after the corresponding local merge committed successfully. */
export function rememberAppliedRecoveryRecord(store: string, record: unknown): void {
  const identity = currentIdentity();
  const baseline = baselineForCurrentFarm();
  if (!identity || !baseline) return;
  const records = baseline.records[store];
  if (!records) throw new Error(`${store} の復旧後同期基準がありません。`);
  const id = '$singleton' in records ? '$singleton' : String((record as { id?: unknown })?.id ?? '');
  if (!id) throw new Error('適用済み記録の同期IDを確認できません。');
  const advanced: Baseline = { ...baseline, records: {
    ...baseline.records, [store]: { ...records, [id]: recoveryRecordContent(record) },
  } };
  try {
    const raw = JSON.stringify(advanced);
    window.localStorage.setItem(scopedKey(BASELINE_PREFIX, identity.farmId), raw);
    cachedBaseline = { farmId: identity.farmId, raw, value: advanced };
  } catch {
    baselineFailureFarm = identity.farmId;
    // Keep the prior baseline intact and retain a small durable stop marker.
    // If even the marker cannot be stored, this tab still remains stopped.
    try {
      if (!pauseMarker(identity.farmId)) window.localStorage.setItem(scopedKey(PAUSE_PREFIX, identity.farmId), JSON.stringify({
        owner: `baseline-failed-${crypto.randomUUID()}`, userId: identity.userId, startedAt: new Date().toISOString(),
      }));
    } catch { /* the in-memory stop also fails closed */ }
    throw new Error('同期基準を端末へ保存できませんでした。通常同期を停止しました。');
  }
}
