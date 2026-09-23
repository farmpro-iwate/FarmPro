import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

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

    expect(await screen.findByText(/7358/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ワクチン/ })).toBeInTheDocument();
  });

  it('繁殖牛の活動登録から対象情報付きで出荷・販売へ遷移できる', async () => {
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
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '活動登録' }));
    await user.click(await screen.findByRole('button', { name: /出荷・販売/ }));

    const locationText = screen.getByTestId('location').textContent || '';
    expect(locationText).toContain('/sales/new?');
    expect(locationText).toContain('targetType=%E6%88%90%E7%89%9B');
    expect(locationText).toContain('targetNumber=7358');
    expect(locationText).toContain('targetName=%E3%81%AF%E3%81%AA%E3%81%BF%E3%81%A4');
    expect(locationText).toContain('cattleId=123');
    expect(locationText).toContain('returnTo=%2Fcattle%2F123');
  });

});
