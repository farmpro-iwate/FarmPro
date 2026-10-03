import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmbryoTransferPlanForm } from './EmbryoTransferPlanForm';
import * as breedingApi from '../services/breedingApi';
import * as scheduleApi from '../services/scheduleApi';

vi.mock('../components/CattlePicker', () => ({ CattlePicker: () => null }));

describe('EmbryoTransferPlanForm schedule linkage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('stores the created schedule id on the ET breeding record', async () => {
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 101 } as any);
    const createSchedule = vi.spyOn(scheduleApi, 'createSchedule').mockResolvedValue({ id: 202 } as any);
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({ id: 101 } as any);

    render(
      <MemoryRouter initialEntries={['/breedings/embryo-transfer-plan?targetNumber=0254&targetName=%E3%83%86%E3%82%B9%E3%83%88%E6%AF%8D%E7%89%9B']}>
        <EmbryoTransferPlanForm />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('発情確認日'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'ET予定を保存' }));

    await waitFor(() => expect(createBreeding).toHaveBeenCalled());
    await waitFor(() => expect(createSchedule).toHaveBeenCalled());
    await waitFor(() => expect(updateBreeding).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ sourceScheduleId: '202' }),
    ));
  });
});
