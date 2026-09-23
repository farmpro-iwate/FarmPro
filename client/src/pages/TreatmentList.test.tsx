import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TreatmentList } from './TreatmentList';
import * as treatmentApi from '../services/treatmentApi';
import * as expensesApi from '../services/expensesApi';

describe('TreatmentList delete linked expenses', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('治療記録削除時に連動した医薬品費・診療費も削除する', async () => {
    const treatment = {
      id: 123,
      targetName: 'はなみつ',
      targetNumber: '7358',
      treatmentDate: '2026-09-23',
      recordType: '治療',
      symptom: '動作確認',
      diagnosis: 'テスト',
      treatmentProcedure: '',
      medicine: 'テスト薬',
      withdrawalEndDate: '',
      veterinarian: '',
      progress: '経過観察',
      note: '',
    } as any;

    vi.spyOn(treatmentApi, 'getTreatmentList')
      .mockResolvedValueOnce([treatment])
      .mockResolvedValueOnce([]);
    const deleteTreatment = vi.spyOn(treatmentApi, 'deleteTreatment').mockResolvedValue(undefined);
    const deleteExpenseBySource = vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TreatmentList />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('はなみつ')).not.toHaveLength(0);
    await user.click(screen.getAllByRole('button', { name: /削除/ })[0]);

    expect(deleteExpenseBySource).toHaveBeenCalledWith('treatment', '123', '医薬品費');
    expect(deleteExpenseBySource).toHaveBeenCalledWith('treatment', '123', '診療費');
    expect(deleteTreatment).toHaveBeenCalledWith(123);
  });
});
