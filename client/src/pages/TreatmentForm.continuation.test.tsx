import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentForm } from './TreatmentForm';
import * as treatmentApi from '../services/treatmentApi';

describe('TreatmentForm continuation mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses the compact continuation form when the animal already has an active treatment', async () => {
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([{
      id: 10,
      recordType: '治療',
      targetNumber: '6891',
      targetName: 'あいうえお',
      symptom: '下痢',
      diagnosis: '腸炎',
      treatmentProcedure: '',
      treatmentDate: '2026-10-03',
      medicine: '',
      dosage: '',
      medicineCost: '',
      medicalFee: '',
      withdrawalEndDate: '',
      veterinarian: '担当獣医',
      progress: '治療中',
      note: '',
    }] as any);

    render(
      <MemoryRouter initialEntries={['/treatments/new?targetNumber=6891&targetName=%E3%81%82%E3%81%84%E3%81%86%E3%81%88%E3%81%8A']}>
        <TreatmentForm mode="create" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('継続治療を記録')).toBeInTheDocument();
    expect(screen.getByText(/前回の治療を引き継いで記録します/)).toBeInTheDocument();
    expect(screen.queryByLabelText('治療区分')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('症状')).not.toBeInTheDocument();
    expect(screen.getByLabelText('治療日')).toBeInTheDocument();
    expect(screen.getByLabelText('経過')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前回情報・費用を確認・修正' })).toBeInTheDocument();
  });

  it('keeps the normal new-treatment form when there is no active treatment', async () => {
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([] as any);

    render(
      <MemoryRouter initialEntries={['/treatments/new?targetNumber=7001&targetName=%E5%88%A5%E3%81%AE%E5%AD%90%E7%89%9B']}>
        <TreatmentForm mode="create" />
      </MemoryRouter>,
    );

    expect(await screen.findByText('治療記録を新規登録')).toBeInTheDocument();
    expect(screen.getByLabelText('治療区分')).toBeInTheDocument();
    expect(screen.getByLabelText('症状')).toBeInTheDocument();
  });
});
