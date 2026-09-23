import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

describe('GlobalAnimalSearch contextual activity menu', () => {
  it('繁殖牛の個体詳細ではワクチン登録を表示する', async () => {
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([
      {
        id: '123',
        earTag: '7358',
        identificationNumber: '1406773581',
        name: 'はなみつ',
      },
    ] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <GlobalAnimalSearch />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '活動登録' }));

    expect(await screen.findByText('対象：繁殖牛　7358　はなみつ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ワクチン/ })).toBeInTheDocument();
  });
});
