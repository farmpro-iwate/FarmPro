import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/breedingApi', () => ({
  getBreeding: vi.fn(async () => ({
    id: 'test-breeding',
    cowEarTag: 'TEST-ET-001', cowName: 'ET検証用',
    breedingMethod: '受精卵移植', breedingStatus: '移植実施',
    heatDate: '2026-10-16', transferDate: '2026-10-23',
    pregnancyCheckExpectedDate: '2026-12-13',
    nextHeatExpectedDate: '2026-11-20',
    expectedCalvingDate: '2027-08-09',
    pregnancyResult: '未鑑定',
  })),
  updateBreeding: vi.fn(),
  createBreeding: vi.fn(),
  deleteBreeding: vi.fn(),
}));
vi.mock('../services/settingsApi', () => ({
  getFarmSettings: vi.fn(async () => ({ estrousCycleDays: 21 })),
}));
vi.mock('../services/masterApi', () => ({
  getMasterList: vi.fn(async () => []),
  createMaster: vi.fn(),
}));

import { BreedingForm } from './BreedingForm';

afterEach(() => cleanup());

describe('繁殖記録編集時の保存済み予定日保護', () => {
  it('編集画面を開いても再計算結果で保存済み予定日を上書きしない', async () => {
    render(
      <MemoryRouter initialEntries={['/breedings/test-breeding/edit']}>
        <Routes>
          <Route path="/breedings/:id/edit" element={<BreedingForm mode="edit" />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-12-13')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('2026-11-20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2027-08-09')).toBeInTheDocument();
  });
});
