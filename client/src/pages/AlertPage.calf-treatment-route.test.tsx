import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertPage } from './AlertPage';
import * as scheduleApi from '../services/scheduleApi';
import * as breedingApi from '../services/breedingApi';
import * as vaccineApi from '../services/vaccineApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as calfApi from '../services/calfApi';
import * as alertSettings from '../services/alertSettings';

describe('calf treatment alert route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([] as any);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(alertSettings, 'getAlertSettings').mockResolvedValue({
      scheduleDays: 30,
      pregnancyCheckDays: 14,
      nextHeatDays: 14,
      recheckDays: 14,
      calvingDays: 60,
      vaccineDays: 30,
    } as any);
  });

  it('opens the calf chart instead of the treatment history for an active calf treatment', async () => {
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([{
      id: 10,
      targetNumber: '5754',
      targetName: '子牛A',
      treatmentDate: '2026-10-04',
      progress: '治療中',
      symptom: '下痢',
    }] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 55,
      calfNumber: '5754',
      name: '子牛A',
      birthday: '2026-08-01',
    }] as any);

    render(<MemoryRouter><AlertPage /></MemoryRouter>);

    const link = await screen.findByRole('link', { name: '開く' });
    expect(link).toHaveAttribute('href', '/calves/55');
  });

  it('keeps the treatment history fallback when the treatment cannot be matched to a calf', async () => {
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([{
      id: 11,
      targetNumber: '9999',
      targetName: '未特定',
      treatmentDate: '2026-10-04',
      progress: '治療中',
    }] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);

    render(<MemoryRouter><AlertPage /></MemoryRouter>);

    const link = await screen.findByRole('link', { name: '開く' });
    expect(link).toHaveAttribute('href', '/treatments');
  });
});
