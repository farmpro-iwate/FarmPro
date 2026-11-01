import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { canRetryUnsentExpensesOnPage, retryUnsentExpenses } from '../services/expensesApi';
import { retryPendingCattleSync } from '../services/api';
import { retryPendingCalfSync } from '../services/calfApi';
import { ANIMAL_SYNC_STATUS_EVENT } from '../services/animalRecordSyncSafety';

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

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(canRetryUnsentExpensesOnPage).mockReturnValue(true);
  vi.mocked(retryUnsentExpenses).mockResolvedValue(0);
  vi.mocked(retryPendingCattleSync).mockResolvedValue(0);
  vi.mocked(retryPendingCalfSync).mockResolvedValue(0);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  it('個体詳細では共通の「＋ 活動登録」を表示せず、個体専用の活動登録入口は残す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.queryByText('＋ 活動登録')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '活動登録' })).toBeInTheDocument();
  });

  it('ホームでは共通の「＋ 活動登録」を表示する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('＋ 活動登録').length).toBeGreaterThan(0);
  });

  it('対象牛を開いていない活動登録の妊娠鑑定は繁殖管理へ進む', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppLayout><div>home</div></AppLayout>
      </MemoryRouter>,
    );

    const buttons = screen.getAllByText('＋ 活動登録');
    fireEvent.click(buttons[0]);

    const pregnancyLink = screen.getByRole('menuitem', { name: '妊娠鑑定' });
    expect(pregnancyLink).toHaveAttribute('href', '/breedings');
  });
});


describe('AppLayout Farm AI current animal context', () => {
  it('個体詳細のAI相談へ現在画面を渡す', () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <AppLayout><div>detail</div></AppLayout>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: '✨ AI相談' });
    expect(links.some((link) => link.getAttribute('href') === '/ai-help?from=%2Fcattle%2F123')).toBe(true);
  });
});


describe('AppLayout Farm AI new question reset', () => {
  it('AI相談画面で上部のAI相談を押すと新規質問イベントを送る', () => {
    let dispatched = 0;
    const listener = () => { dispatched += 1; };
    window.addEventListener('farmpro:ai-help-new-question', listener);

    render(
      <MemoryRouter initialEntries={['/ai-help']}>
        <AppLayout><div>ai help</div></AppLayout>
      </MemoryRouter>,
    );

    const links = screen.getAllByRole('link', { name: '✨ AI相談' });
    links.forEach((link) => fireEvent.click(link));
    expect(dispatched).toBeGreaterThan(0);

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

    const buttons = screen.getAllByRole('button', { name: 'その他の管理' });
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

    const buttons = screen.getAllByRole('button', { name: 'その他の管理' });
    fireEvent.click(buttons[0]);

    expect(screen.getByText('牛・繁殖')).toBeInTheDocument();
    expect(screen.getByText('健康・飼養')).toBeInTheDocument();
    expect(screen.getByText('販売・経営')).toBeInTheDocument();
    expect(screen.getByText('データ・設定')).toBeInTheDocument();

    expect(screen.getByRole('menuitem', { name: '繁殖管理' })).toHaveAttribute('href', '/breedings');
    expect(screen.getByRole('menuitem', { name: '出荷販売' })).toHaveAttribute('href', '/sales');
    expect(screen.getByRole('menuitem', { name: '販売済み牛一覧' })).toHaveAttribute('href', '/cattle/sold');
    expect(screen.getByRole('menuitem', { name: '経費管理' })).toHaveAttribute('href', '/expenses');
    expect(screen.getByRole('menuitem', { name: '過去データ入力' })).toHaveAttribute('href', '/past-data-entry');
  });
});
