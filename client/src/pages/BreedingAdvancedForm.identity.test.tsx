import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
}));

import { getAllRecords } from '../storage/repository';
import { BreedingAdvancedForm } from './BreedingAdvancedForm';
import * as breedingAdvancedApi from '../services/breedingAdvancedApi';

describe('BreedingAdvancedForm cattle identity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getAllRecords).mockResolvedValue([
      { id: 'cow-9', earTag: '0254', name: 'おと', sex: '雌' },
    ] as any);
  });

  it('saves both the internal cattle id and stable ear tag when a cow is selected', async () => {
    const create = vi.spyOn(breedingAdvancedApi, 'createBreedingAdvancedRecord')
      .mockResolvedValue({ id: 'advanced-1' } as any);

    render(
      <MemoryRouter>
        <BreedingAdvancedForm />
      </MemoryRouter>,
    );

    const select = await screen.findByLabelText('母牛を選択');
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('0254 おと'));

    fireEvent.click(screen.getByRole('button', { name: '登録する' }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      cowId: 'cow-9',
      cowEarTag: '0254',
      cowName: 'おと',
    }));
  });
});
