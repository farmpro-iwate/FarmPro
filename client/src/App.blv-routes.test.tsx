import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as blvApi from './services/blvApi';
import * as expensesApi from './services/expensesApi';
import * as cattleApi from './services/api';
import * as calfApi from './services/calfApi';
import * as vaccineApi from './services/vaccineApi';
import * as treatmentApi from './services/treatmentApi';
import * as breedingApi from './services/breedingApi';
import * as feedingAlertActionsApi from './services/feedingAlertActionsApi';
import * as fatteningTransitionsApi from './services/fatteningTransitionsApi';
import type { BlvTest } from './types/blv';

// Keep the real router, registration guard, navigation and BLV screens. These
// unrelated destinations and pickers do not participate in route access.
vi.mock('./pages/Home', () => ({ Home: () => <h1>ホームの確認画面</h1> }));
vi.mock('./pages/LoginPage', () => ({ LoginPage: () => <h1>ログインの確認画面</h1> }));
vi.mock('./components/GlobalAnimalSearch', () => ({ GlobalAnimalSearch: () => null }));
vi.mock('./components/CattlePicker', () => ({ CattlePicker: () => null }));

const record: BlvTest = {
  id: 41, cowEarTag: 'BLV-41', cowName: '経路確認の牛', testDate: '2026-11-01',
  result: '陰性', nextTestDate: '', isolationMemo: '', note: '既存記録の確認',
};
const routes = [
  { path: '/blv', title: 'BLV管理' },
  { path: '/blv/new', title: 'BLV検査記録を新規登録' },
  { path: '/blv/41/edit?returnTo=/calendar', title: 'BLV検査記録を編集' },
] as const;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-route">{location.pathname}{location.search}</output>;
}
function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><LocationProbe /></MemoryRouter>);
}
function signIn() {
  localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'route-user', farmId: 'route-farm', farmName: '経路確認農場', name: '経路確認利用者', plan: 'standard',
  }));
  localStorage.setItem('farmpro.authToken', 'route-token');
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([record]);
  vi.spyOn(blvApi, 'getBlvTest').mockResolvedValue(record);
  vi.spyOn(blvApi, 'createBlvTest').mockResolvedValue(record);
  vi.spyOn(blvApi, 'updateBlvTest').mockResolvedValue(record);
  vi.spyOn(blvApi, 'deleteBlvTest').mockResolvedValue();
  vi.spyOn(blvApi, 'retryPendingBlvSync').mockResolvedValue(0);
  vi.spyOn(expensesApi, 'retryUnsentExpenses').mockResolvedValue(0);
  vi.spyOn(cattleApi, 'retryPendingCattleSync').mockResolvedValue(0);
  vi.spyOn(calfApi, 'retryPendingCalfSync').mockResolvedValue(0);
  vi.spyOn(vaccineApi, 'retryPendingVaccineSync').mockResolvedValue(0);
  vi.spyOn(treatmentApi, 'retryPendingTreatmentSync').mockResolvedValue(0);
  vi.spyOn(breedingApi, 'retryPendingBreedingSync').mockResolvedValue(0);
  vi.spyOn(feedingAlertActionsApi, 'retryPendingFeedingAlertActionSync').mockResolvedValue(0);
  vi.spyOn(fatteningTransitionsApi, 'retryPendingFatteningTransitionSync').mockResolvedValue(0);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operator: false }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('BLV routes through the real App', () => {
  it.each(routes)('opens the registered BLV screen at $path', async ({ path, title }) => {
    signIn();
    renderApp(path);

    await screen.findByRole('heading', { name: title });
    expect(screen.getByTestId('current-route')).toHaveTextContent(path);
    expect(screen.queryByRole('heading', { name: 'ホームの確認画面' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'その他の管理' }).length).toBeGreaterThan(0);
    if (path === '/blv') {
      await waitFor(() => expect(blvApi.getBlvTestList).toHaveBeenCalledOnce());
      expect(screen.getAllByText(record.cowName).length).toBeGreaterThan(0);
    } else if (path.includes('/edit')) {
      expect(await screen.findByDisplayValue(record.cowName)).toBeInTheDocument();
      expect(blvApi.getBlvTest).toHaveBeenCalledWith('41');
      expect(screen.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/calendar');
    } else {
      expect(screen.getByRole('textbox', { name: '牛名' })).toHaveValue('');
      expect(blvApi.getBlvTest).not.toHaveBeenCalled();
    }
    expect(blvApi.createBlvTest).not.toHaveBeenCalled();
    expect(blvApi.updateBlvTest).not.toHaveBeenCalled();
    expect(blvApi.deleteBlvTest).not.toHaveBeenCalled();
  });

  it.each(routes)('requires registration before opening $path', async ({ path, title }) => {
    renderApp(path);

    await screen.findByRole('heading', { name: 'ログインの確認画面' });
    expect(screen.getByTestId('current-route')).toHaveTextContent('/login');
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
    expect(blvApi.getBlvTestList).not.toHaveBeenCalled();
    expect(blvApi.getBlvTest).not.toHaveBeenCalled();
    expect(blvApi.createBlvTest).not.toHaveBeenCalled();
    expect(blvApi.updateBlvTest).not.toHaveBeenCalled();
    expect(blvApi.deleteBlvTest).not.toHaveBeenCalled();
  });

  it('opens the real BLV list from the health and feeding navigation group', async () => {
    signIn();
    renderApp('/');
    await screen.findByRole('heading', { name: 'ホームの確認画面' });
    fireEvent.click(screen.getAllByRole('button', { name: 'その他の管理' })[0]);
    expect(screen.getByText('健康・飼養')).toBeInTheDocument();
    const link = screen.getByRole('menuitem', { name: 'BLV管理' });
    expect(link).toHaveAttribute('href', '/blv');

    fireEvent.click(link);

    await screen.findByRole('heading', { name: 'BLV管理' });
    expect(screen.getByTestId('current-route')).toHaveTextContent('/blv');
    expect(screen.getAllByText(record.cowName).length).toBeGreaterThan(0);
    expect(blvApi.getBlvTestList).toHaveBeenCalledOnce();
  });
});
