import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentList } from './TreatmentList';
import type { Treatment } from '../types/treatment';
import * as treatmentApi from '../services/treatmentApi';
import * as authClient from '../services/authClient';
import * as currentPlan from '../plans/current-plan';

const medication: Treatment = {
  id: 1001, targetName: '確認用投薬牛', targetNumber: '0001', treatmentDate: '2026-11-01',
  recordType: '投薬', symptom: '', diagnosis: '', treatmentProcedure: '',
  medicine: '確認用薬', dosage: '確認用の投薬量', withdrawalEndDate: '', veterinarian: '', progress: '', note: '',
};
const legacyTreatment: Treatment = {
  ...medication, id: 1002, targetName: '確認用治療牛', targetNumber: '0002', recordType: undefined,
  treatmentDate: '2026-10-31', symptom: '確認用症状', progress: '経過観察',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

beforeEach(() => {
  vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([medication, legacyTreatment]);
  vi.spyOn(treatmentApi, 'deleteTreatment').mockRejectedValue(new Error('Navigation tests must not delete records'));
  vi.spyOn(authClient, 'getStoredAuthUser').mockReturnValue(null);
  vi.spyOn(authClient, 'getAuthToken').mockReturnValue(null);
  vi.spyOn(currentPlan, 'getCurrentFarmProPlanId').mockReturnValue('free');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Navigation tests must not call APIs')));
});
afterEach(() => {
  cleanup();
  expect(treatmentApi.deleteTreatment).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TreatmentList medication entry', () => {
  it('履歴の投薬入口は投薬区分を指定し、治療の入口も残す', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/treatments']}><TreatmentList /><LocationProbe /></MemoryRouter>);
    await screen.findByText('表示：2件 / 全2件');
    expect(screen.getByRole('heading', { name: '治療・投薬履歴' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '治療を記録' })).toHaveAttribute('href', '/treatments/new');
    await user.click(screen.getByRole('link', { name: '投薬を記録' }));
    const destination = new URL(screen.getByTestId('location').textContent || '', 'https://fixture.invalid');
    expect(destination.pathname).toBe('/treatments/new');
    expect(destination.searchParams.get('recordType')).toBe('投薬');
  });

  it('投薬日を示し、区分で投薬だけを絞り込んでも旧治療記録を変更しない', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/treatments']}><TreatmentList /></MemoryRouter>);
    await screen.findByText('表示：2件 / 全2件');
    expect(screen.getByText('投薬日').parentElement).toHaveTextContent('2026-11-01');
    expect(screen.getByText('投薬日：').parentElement).toHaveTextContent('2026-11-01');
    expect(screen.getByText('投薬量：').parentElement).toHaveTextContent('確認用の投薬量');
    expect(screen.getByText('投薬量：確認用の投薬量')).toBeInTheDocument();
    expect(screen.getByText('治療日：').parentElement).toHaveTextContent('2026-10-31');
    await user.click(screen.getByRole('button', { name: '検索・絞り込み' }));
    await user.click(screen.getByRole('combobox', { name: '記録区分' }));
    await user.click(screen.getByRole('option', { name: '投薬' }));
    expect(screen.getByText('表示：1件 / 全2件')).toBeInTheDocument();
    expect(screen.getAllByText('確認用投薬牛')).not.toHaveLength(0);
    expect(screen.queryByText('確認用治療牛')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'クリア' }));
    expect(screen.getByText('表示：2件 / 全2件')).toBeInTheDocument();
    expect(screen.getAllByText('確認用治療牛')).not.toHaveLength(0);
    expect(legacyTreatment.recordType).toBeUndefined();
  });
});
