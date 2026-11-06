import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { canRetryUnsentExpensesOnPage, retryUnsentExpenses } from '../services/expensesApi';
import { retryPendingCattleSync } from '../services/api';
import { retryPendingCalfSync } from '../services/calfApi';
import { ANIMAL_SYNC_STATUS_EVENT } from '../services/animalRecordSyncSafety';
import { retryPendingVaccineSync, VACCINE_SYNC_STATUS_EVENT } from '../services/vaccineApi';
import { retryPendingTreatmentSync, TREATMENT_SYNC_STATUS_EVENT } from '../services/treatmentApi';
import { retryPendingBreedingSync, BREEDING_SYNC_STATUS_EVENT } from '../services/breedingApi';
import { retryPendingBlvSync, BLV_SYNC_STATUS_EVENT } from '../services/blvApi';
import { retryPendingFeedingAlertActionSync, FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT } from '../services/feedingAlertActionsApi';
import { retryPendingFatteningTransitionSync, FATTENING_TRANSITION_SYNC_STATUS_EVENT } from '../services/fatteningTransitionsApi';
import { retryPendingActivityRecordSync } from '../services/activityRecordsApi';

vi.mock('../services/expensesApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/expensesApi')>(),
  canRetryUnsentExpensesOnPage: vi.fn(() => true),
  retryUnsentExpenses: vi.fn(async () => 0),
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/api')>(),
  retryPendingCattleSync: vi.fn(async () => 0),
}));
vi.mock('../services/calfApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/calfApi')>(),
  retryPendingCalfSync: vi.fn(async () => 0),
}));
vi.mock('../services/vaccineApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/vaccineApi')>(),
  retryPendingVaccineSync: vi.fn(async () => 0),
}));
vi.mock('../services/treatmentApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/treatmentApi')>(),
  retryPendingTreatmentSync: vi.fn(async () => 0),
}));
vi.mock('../services/breedingApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/breedingApi')>(),
  retryPendingBreedingSync: vi.fn(async () => 0),
}));
vi.mock('../services/blvApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/blvApi')>(),
  retryPendingBlvSync: vi.fn(async () => 0),
}));
vi.mock('../services/feedingAlertActionsApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/feedingAlertActionsApi')>(),
  retryPendingFeedingAlertActionSync: vi.fn(async () => 0),
}));
vi.mock('../services/fatteningTransitionsApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/fatteningTransitionsApi')>(),
  retryPendingFatteningTransitionSync: vi.fn(async () => 0),
}));
vi.mock('../services/activityRecordsApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/activityRecordsApi')>(),
  retryPendingActivityRecordSync: vi.fn(async () => 0),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(canRetryUnsentExpensesOnPage).mockReturnValue(true);
  vi.mocked(retryUnsentExpenses).mockResolvedValue(0);
  vi.mocked(retryPendingCattleSync).mockResolvedValue(0);
  vi.mocked(retryPendingCalfSync).mockResolvedValue(0);
  vi.mocked(retryPendingVaccineSync).mockResolvedValue(0);
  vi.mocked(retryPendingTreatmentSync).mockResolvedValue(0);
  vi.mocked(retryPendingBreedingSync).mockResolvedValue(0);
  vi.mocked(retryPendingBlvSync).mockResolvedValue(0);
  vi.mocked(retryPendingFeedingAlertActionSync).mockResolvedValue(0);
  vi.mocked(retryPendingFatteningTransitionSync).mockResolvedValue(0);
  vi.mocked(retryPendingActivityRecordSync).mockResolvedValue(0);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AppLayout vaccine resume events', () => {
  function signIn(changes: { farmId?: string; id?: string; plan?: string; token?: string } = {}) {
    window.localStorage.setItem('farmpro.authUser', JSON.stringify({
      id: changes.id ?? 'fixture-vaccine-user', farmId: changes.farmId ?? 'fixture-vaccine-farm',
      plan: changes.plan ?? 'standard',
    }));
    window.localStorage.setItem('farmpro.authToken', changes.token ?? 'fixture-vaccine-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operator: false }))));
  }

  it.each(['/vaccines', '/vaccines/123/edit', '/'])('通常画面 %s で再送し、重複する復帰イベントをまとめる', async pathname => {
    signIn();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingVaccineSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(VACCINE_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><div>vaccines</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(retryPendingVaccineSync).toHaveBeenCalledOnce();
    await act(async () => { complete(1); });
    await waitFor(() => expect(retryPendingVaccineSync).toHaveBeenCalledTimes(2));
    expect(received).toHaveBeenCalledOnce();
    view.unmount();
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    expect(retryPendingVaccineSync).toHaveBeenCalledTimes(2);
    window.removeEventListener(VACCINE_SYNC_STATUS_EVENT, received);
  });

  it.each(['free', 'signed-out', 'offline', 'hidden'])('%s 中は自動再送せず、復帰条件が整ってから実行する', async state => {
    signIn({ plan: state === 'free' ? 'free' : 'standard' });
    if (state === 'signed-out') window.localStorage.removeItem('farmpro.authToken');
    if (state === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (state === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const view = render(<MemoryRouter initialEntries={['/vaccines']}><AppLayout><div>vaccines</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    expect(retryPendingVaccineSync).not.toHaveBeenCalled();
    if (state === 'offline' || state === 'hidden') {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() => expect(retryPendingVaccineSync).toHaveBeenCalledOnce());
    }
    view.unmount();
  });

  it('受信・バックアップ・販売精算では再送せず、画面遷移後の古い応答からも通知しない', async () => {
    signIn();
    for (const pathname of ['/device-sync', '/backups', '/sales/sale-1/settlement', '/vaccines-other']) {
      const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><div>protected</div></AppLayout></MemoryRouter>);
      fireEvent(window, new Event('online'));
      view.unmount();
    }
    expect(retryPendingVaccineSync).not.toHaveBeenCalled();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingVaccineSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(VACCINE_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/vaccines']}><AppLayout><Link to="/backups">保護画面へ</Link></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    fireEvent.click(screen.getByRole('link', { name: '保護画面へ' }));
    await act(async () => { complete(1); });
    expect(retryPendingVaccineSync).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(VACCINE_SYNC_STATUS_EVENT, received);
  });

  it.each([
    { farmId: 'different-farm' }, { id: 'different-user' }, { plan: 'free' }, { token: 'different-token' },
  ])('通信待機中にログイン条件 %j が変わった場合は通知と追加再送を止める', async changes => {
    signIn();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingVaccineSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(VACCINE_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/vaccines']}><AppLayout><div>vaccines</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    signIn(changes);
    await act(async () => { complete(1); });
    fireEvent(window, new Event('focus'));
    expect(retryPendingVaccineSync).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(VACCINE_SYNC_STATUS_EVENT, received);
  });

  it('再送失敗を成功通知せず、次の通信復帰で再試行できる', async () => {
    signIn({ plan: 'pro' });
    vi.mocked(retryPendingVaccineSync).mockRejectedValueOnce(new TypeError('fixture: offline'));
    const received = vi.fn();
    window.addEventListener(VACCINE_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/vaccines']}><AppLayout><div>vaccines</div></AppLayout></MemoryRouter>);
    await act(async () => undefined);
    expect(received).not.toHaveBeenCalled();
    vi.mocked(retryPendingVaccineSync).mockResolvedValueOnce(1);
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(received).toHaveBeenCalledOnce());
    expect(retryPendingVaccineSync).toHaveBeenCalledTimes(2);
    view.unmount();
    window.removeEventListener(VACCINE_SYNC_STATUS_EVENT, received);
  });
});

describe('AppLayout owned record resume events', () => {
  const sources = [
    { pathname: '/treatments', retry: retryPendingTreatmentSync, event: TREATMENT_SYNC_STATUS_EVENT },
    { pathname: '/breedings', retry: retryPendingBreedingSync, event: BREEDING_SYNC_STATUS_EVENT },
    { pathname: '/blv', retry: retryPendingBlvSync, event: BLV_SYNC_STATUS_EVENT },
    { pathname: '/feeding-alert-actions', retry: retryPendingFeedingAlertActionSync, event: FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT },
    { pathname: '/fattening-transitions', retry: retryPendingFatteningTransitionSync, event: FATTENING_TRANSITION_SYNC_STATUS_EVENT },
  ];
  function signIn(changes: { farmId?: string; id?: string; plan?: string; token?: string } = {}) {
    localStorage.setItem('farmpro.authUser', JSON.stringify({
      id: 'record-user', farmId: 'record-farm', plan: 'standard', ...changes,
    }));
    localStorage.setItem('farmpro.authToken', changes.token ?? 'record-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operator: false }))));
  }

  it.each([{ ...sources[0], pathname: '/' }, ...sources])('retries the relevant source on $pathname and coalesces resume events', async ({ pathname, retry: selected, event }) => {
    signIn();
    let complete!: (changed: number) => void;
    vi.mocked(selected).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(event, received);
    const interval = vi.spyOn(window, 'setInterval');
    const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><div>records</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(selected).toHaveBeenCalledOnce();
    sources.forEach(source => expect(source.retry).toHaveBeenCalledTimes(pathname === '/' || pathname === source.pathname ? 1 : 0));
    expect(interval).not.toHaveBeenCalled();
    await act(async () => { complete(1); });
    await waitFor(() => expect(selected).toHaveBeenCalledTimes(2));
    expect(received).toHaveBeenCalledOnce();
    view.unmount();
    fireEvent(window, new Event('online'));
    expect(selected).toHaveBeenCalledTimes(2);
    window.removeEventListener(event, received);
  });

  it('does not automatically retry during editing, receiving, restore or settlement', () => {
    signIn();
    for (const pathname of ['/treatments/new', '/treatments/1/edit', '/breedings/new', '/breedings/1/edit',
      '/feeding-alert-actions/new', '/feeding-alert-actions/1/edit', '/feeding-alert-actions-other',
      '/fattening-transitions/new', '/fattening-transitions/1/edit', '/fattening-transitions-other',
      '/blv/new', '/blv/1/edit', '/blv-other', '/device-sync', '/backups', '/sales/1/settlement', '/treatments-other', '/breedings-other']) {
      const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><div>protected</div></AppLayout></MemoryRouter>);
      fireEvent(window, new Event('focus'));
      fireEvent(window, new Event('online'));
      view.unmount();
    }
    sources.forEach(source => expect(source.retry).not.toHaveBeenCalled());
  });

  it.each(['free', 'signed-out', 'offline', 'hidden'])('leaves all sources alone while %s', async state => {
    signIn({ plan: state === 'free' ? 'free' : 'standard' });
    if (state === 'signed-out') localStorage.removeItem('farmpro.authToken');
    if (state === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (state === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const view = render(<MemoryRouter initialEntries={['/']}><AppLayout><div>home</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    sources.forEach(source => expect(source.retry).not.toHaveBeenCalled());
    if (state === 'offline' || state === 'hidden') {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() => expect(retryPendingTreatmentSync).toHaveBeenCalledOnce());
      sources.forEach(source => expect(source.retry).toHaveBeenCalledOnce());
    }
    view.unmount();
  });

  it.each([{ farmId: 'other-farm' }, { id: 'other-user' }, { plan: 'free' }, { token: 'other-token' }])(
    'rejects old completion and queued retries after context changes to %j', async changes => {
      signIn();
      let complete!: (changed: number) => void;
      vi.mocked(retryPendingTreatmentSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
      const received = vi.fn();
      window.addEventListener(TREATMENT_SYNC_STATUS_EVENT, received);
      const view = render(<MemoryRouter initialEntries={['/treatments']}><AppLayout><div>records</div></AppLayout></MemoryRouter>);
      fireEvent(window, new Event('online'));
      signIn(changes);
      await act(async () => { complete(1); });
      fireEvent(window, new Event('focus'));
      expect(retryPendingTreatmentSync).toHaveBeenCalledOnce();
      expect(received).not.toHaveBeenCalled();
      view.unmount();
      window.removeEventListener(TREATMENT_SYNC_STATUS_EVENT, received);
    },
  );

  it.each(['route', 'unmount'])('ignores a delayed source completion after %s', async change => {
    signIn();
    let complete!: (changed: number) => void;
    vi.mocked(retryPendingBreedingSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(BREEDING_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/breedings']}><AppLayout><Link to="/backups">restore</Link></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    if (change === 'route') fireEvent.click(screen.getByRole('link', { name: 'restore' }));
    else view.unmount();
    await act(async () => { complete(1); });
    fireEvent(window, new Event('online'));
    expect(retryPendingBreedingSync).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(BREEDING_SYNC_STATUS_EVENT, received);
  });

  it('lets the other source finish after one source fails and retries on a later online event', async () => {
    signIn();
    vi.mocked(retryPendingTreatmentSync).mockRejectedValueOnce(new TypeError('offline'));
    vi.mocked(retryPendingBreedingSync).mockResolvedValueOnce(1);
    vi.mocked(retryPendingBlvSync).mockResolvedValueOnce(1);
    vi.mocked(retryPendingFeedingAlertActionSync).mockResolvedValueOnce(1);
    vi.mocked(retryPendingFatteningTransitionSync).mockResolvedValueOnce(1);
    const treatmentReceived = vi.fn();
    const breedingReceived = vi.fn();
    const blvReceived = vi.fn();
    const feedingReceived = vi.fn();
    const fatteningReceived = vi.fn();
    window.addEventListener(TREATMENT_SYNC_STATUS_EVENT, treatmentReceived);
    window.addEventListener(BREEDING_SYNC_STATUS_EVENT, breedingReceived);
    window.addEventListener(BLV_SYNC_STATUS_EVENT, blvReceived);
    window.addEventListener(FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT, feedingReceived);
    window.addEventListener(FATTENING_TRANSITION_SYNC_STATUS_EVENT, fatteningReceived);
    const view = render(<MemoryRouter initialEntries={['/']}><AppLayout><div>home</div></AppLayout></MemoryRouter>);
    await waitFor(() => expect(breedingReceived).toHaveBeenCalledOnce());
    expect(blvReceived).toHaveBeenCalledOnce();
    expect(feedingReceived).toHaveBeenCalledOnce();
    expect(fatteningReceived).toHaveBeenCalledOnce();
    expect(treatmentReceived).not.toHaveBeenCalled();
    vi.mocked(retryPendingTreatmentSync).mockResolvedValueOnce(1);
    fireEvent(window, new Event('online'));
    await waitFor(() => expect(treatmentReceived).toHaveBeenCalledOnce());
    expect(retryPendingTreatmentSync).toHaveBeenCalledTimes(2);
    expect(breedingReceived).toHaveBeenCalledOnce();
    view.unmount();
    window.removeEventListener(TREATMENT_SYNC_STATUS_EVENT, treatmentReceived);
    window.removeEventListener(BREEDING_SYNC_STATUS_EVENT, breedingReceived);
    window.removeEventListener(BLV_SYNC_STATUS_EVENT, blvReceived);
    window.removeEventListener(FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT, feedingReceived);
    window.removeEventListener(FATTENING_TRANSITION_SYNC_STATUS_EVENT, fatteningReceived);
  });

  it.each(sources.slice(2).flatMap(source => ['route', 'unmount', 'token', 'farm'].map(change => ({ ...source, change }))))(
    'ignores delayed $pathname completion after $change changes', async ({ pathname, retry, event, change }) => {
    signIn();
    let complete!: (changed: number) => void;
    vi.mocked(retry).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(event, received);
    const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><Link to="/backups">restore</Link></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    if (change === 'route') fireEvent.click(screen.getByRole('link', { name: 'restore' }));
    if (change === 'unmount') view.unmount();
    if (change === 'token') signIn({ token: 'new-token' });
    if (change === 'farm') signIn({ farmId: 'other-farm' });
    await act(async () => { complete(1); });
    fireEvent(window, new Event('online'));
    expect(retry).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(event, received);
  });
});

describe('AppLayout cattle and calf resume events', () => {
  function signIn(farmId = 'fixture-farm') {
    window.localStorage.setItem('farmpro.authUser', JSON.stringify({ id: 'fixture-user', farmId, plan: 'standard' }));
    window.localStorage.setItem('farmpro.authToken', 'fixture-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operator: false }))));
  }

  it('通信復帰イベントをまとめて実行し、ACKがある時だけ一覧へ通知する', async () => {
    signIn();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingCattleSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/cattle']}><AppLayout><div>cattle</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(retryPendingCattleSync).toHaveBeenCalledOnce();
    expect(retryPendingCalfSync).toHaveBeenCalledOnce();
    await act(async () => { complete(1); });
    await waitFor(() => expect(retryPendingCattleSync).toHaveBeenCalledTimes(2));
    expect(retryPendingCalfSync).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledOnce();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    expect(retryPendingCattleSync).toHaveBeenCalledTimes(2);
    view.unmount();
    window.removeEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
  });

  it('受信・バックアップ・販売精算では始めず、途中で移動した古い処理からも通知や追加再送をしない', async () => {
    signIn();
    for (const pathname of ['/device-sync', '/backups', '/sales/sale-1/settlement']) {
      const view = render(<MemoryRouter initialEntries={[pathname]}><AppLayout><div>protected</div></AppLayout></MemoryRouter>);
      fireEvent(window, new Event('online'));
      view.unmount();
    }
    expect(retryPendingCattleSync).not.toHaveBeenCalled();
    expect(retryPendingCalfSync).not.toHaveBeenCalled();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingCattleSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/calves']}><AppLayout><Link to="/backups">保護画面へ</Link></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    fireEvent.click(screen.getByRole('link', { name: '保護画面へ' }));
    await act(async () => { complete(1); });
    fireEvent(window, new Event('focus'));
    expect(retryPendingCattleSync).toHaveBeenCalledOnce();
    expect(retryPendingCalfSync).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
  });

  it('待機中に農場が変わると古い画面から成功通知や予約された再送を行わない', async () => {
    signIn();
    let complete!: (count: number) => void;
    vi.mocked(retryPendingCattleSync).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const received = vi.fn();
    window.addEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
    const view = render(<MemoryRouter initialEntries={['/cattle']}><AppLayout><div>cattle</div></AppLayout></MemoryRouter>);
    fireEvent(window, new Event('online'));
    signIn('different-farm');
    await act(async () => { complete(1); });
    fireEvent(window, new Event('focus'));
    expect(retryPendingCattleSync).toHaveBeenCalledOnce();
    expect(retryPendingCalfSync).toHaveBeenCalledOnce();
    expect(received).not.toHaveBeenCalled();
    view.unmount();
    window.removeEventListener(ANIMAL_SYNC_STATUS_EVENT, received);
  });
});

describe('AppLayout pending expense retry events', () => {
  it('通常画面の表示・復帰・通信回復で再送し、非表示中と定期timerでは始めない', () => {
    const interval = vi.spyOn(window, 'setInterval');
    render(<MemoryRouter initialEntries={['/breedings']}><AppLayout><div>list</div></AppLayout></MemoryRouter>);
    expect(retryUnsentExpenses).toHaveBeenCalledOnce();

    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(3);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(3);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(4);
    expect(interval).not.toHaveBeenCalled();
  });

  it('受信・バックアップ・販売精算画面では再送も復帰イベント登録もしない', () => {
    vi.mocked(canRetryUnsentExpensesOnPage).mockReturnValue(false);
    const windowListener = vi.spyOn(window, 'addEventListener');
    for (const path of ['/device-sync', '/backups', '/sales/sale-1/settlement']) {
      const view = render(<MemoryRouter initialEntries={[path]}><AppLayout><div>protected</div></AppLayout></MemoryRouter>);
      expect(canRetryUnsentExpensesOnPage).toHaveBeenCalledWith(path);
      fireEvent(window, new Event('focus'));
      fireEvent(window, new Event('online'));
      fireEvent(document, new Event('visibilitychange'));
      view.unmount();
    }
    expect(retryUnsentExpenses).not.toHaveBeenCalled();
    expect(windowListener.mock.calls.filter(([name]) => name === 'focus' || name === 'online')).toHaveLength(0);
  });

  it('画面遷移で対象を再判定し、保護画面への遷移とunmount時に旧listenerを解除する', () => {
    vi.mocked(canRetryUnsentExpensesOnPage).mockImplementation((path) => path !== '/backups');
    const view = render(<MemoryRouter initialEntries={['/breedings']}><AppLayout>
      <Link to="/cattle/123">牛へ</Link><Link to="/backups">バックアップへ</Link><Link to="/expenses">経費へ</Link>
    </AppLayout></MemoryRouter>);
    expect(retryUnsentExpenses).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('link', { name: '牛へ' }));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('link', { name: 'バックアップへ' }));
    fireEvent(window, new Event('online'));
    fireEvent(window, new Event('focus'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('link', { name: '経費へ' }));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(3);
    fireEvent(window, new Event('online'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(4);
    view.unmount();
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(retryUnsentExpenses).toHaveBeenCalledTimes(4);
  });
});

describe('AppLayout activity registration entry', () => {
  // Regression: avoid duplicate global activity entry on animal detail pages.
  it('個体詳細では共通の「＋ 記録する」を表示せず、個体専用の活動登録入口は残す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText('＋ 記録する')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この牛の記録' })).toBeInTheDocument();
  });

  it('ホームでは共通の「＋ 記録する」を表示する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('＋ 記録する').length).toBeGreaterThan(0);
  });

  it('対象牛を開いていない活動登録の妊娠鑑定は繁殖管理へ進む', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByText('＋ 記録する');
    fireEvent.click(buttons[0]);

    const pregnancyLink = screen.getByRole('menuitem', { name: '妊娠鑑定' });
    expect(pregnancyLink).toHaveAttribute('href', '/breedings');
  });

  it('活動登録から農場作業と個体の記録の入力画面を開ける', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByText('＋ 記録する')[0]);

    expect(screen.getByRole('menuitem', { name: '農場作業' })).toHaveAttribute('href', '/activities/new?type=farm');
    expect(screen.getByRole('menuitem', { name: '個体の記録' })).toHaveAttribute('href', '/activities/new?type=animal');
  });
});


describe('AppLayout Farm AI current animal context', () => {
  it('個体詳細のAI相談へ現在画面を渡す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'メニュー' })[0]);
    expect(screen.getByRole('menuitem', { name: 'AI相談' })).toHaveAttribute('href', '/ai-help?from=%2Fcattle%2F123');
    expect(screen.getByRole('menuitem', { name: 'AIで記録' })).toHaveAttribute('href', '/ai-help?mode=record');
  });
});


describe('AppLayout Farm AI new question reset', () => {
  it.each([
    ['/ai-help?mode=record', 'AIで記録', 'AI相談'],
    ['/ai-help?from=%2Fcattle%2F123', 'AI相談', 'AIで記録'],
  ])('%s では現在のAI画面だけを選択中にする', (route, selected, other) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <AppLayout><div>ai</div></AppLayout>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'メニュー' })[0]);
    expect(screen.getByRole('menuitem', { name: selected })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('menuitem', { name: other })).not.toHaveAttribute('aria-current');
  });

  it('AI相談画面でメニューのAI相談を押すと新規質問イベントを送る', () => {
    let dispatched = 0;
    const listener = () => { dispatched += 1; };
    window.addEventListener('farmpro:ai-help-new-question', listener);

    render(
      <MemoryRouter initialEntries={['/ai-help']}>
        <AppLayout><div>ai help</div></AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'メニュー' })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'AI相談' }));
    expect(dispatched).toBe(1);

    window.removeEventListener('farmpro:ai-help-new-question', listener);
  });
});


describe('AppLayout past data entry navigation', () => {
  it('その他の管理から過去データ入力を開ける', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button', { name: 'メニュー' });
    fireEvent.click(buttons[0]);

    const link = screen.getByRole('menuitem', { name: '過去データ入力' });
    expect(link).toHaveAttribute('href', '/past-data-entry');
  });
});


describe('AppLayout other management grouping', () => {
  it('主要機能のリンク先を変えずに整理されたカテゴリで表示する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByRole('button', { name: 'メニュー' });
    fireEvent.click(buttons[0]);

    expect(screen.getByText('予定・入力補助')).toBeInTheDocument();
    expect(screen.getByText('牛・繁殖')).toBeInTheDocument();
    expect(screen.getByText('健康・飼養')).toBeInTheDocument();
    expect(screen.getByText('販売・経営')).toBeInTheDocument();
    expect(screen.getByText('データ・設定')).toBeInTheDocument();

    expect(screen.getByRole('menuitem', { name: 'カレンダー' })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('menuitem', { name: 'AIで記録' })).toHaveAttribute('href', '/ai-help?mode=record');
    expect(screen.getByRole('menuitem', { name: '繁殖管理' })).toHaveAttribute('href', '/breedings');
    expect(screen.getByRole('menuitem', { name: '出荷販売' })).toHaveAttribute('href', '/sales');
    expect(screen.getByRole('menuitem', { name: '販売済み牛一覧' })).toHaveAttribute('href', '/cattle/sold');
    expect(screen.getByRole('menuitem', { name: '経費管理' })).toHaveAttribute('href', '/expenses');
    expect(screen.getByRole('menuitem', { name: '過去データ入力' })).toHaveAttribute('href', '/past-data-entry');
  });
});
