import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalAnimalSearch } from './GlobalAnimalSearch';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    { kind: 'cattle', path: '/cattle/101', id: 101 },
    { kind: 'calf', path: '/calves/202', id: 202 },
  ])('$kind の個体の記録へ種別と対象IDを引き継ぐ', async ({ kind, path, id }) => {
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([
      { id: 101, name: '試験母牛', earTag: '0123', birthday: '2020-01-01' },
    ] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([
      { id: 202, name: '試験子牛', calfNumber: '0456', birthday: '2026-01-01', managementStatus: '育成中' },
    ] as any);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[path]}><GlobalAnimalSearch /><LocationProbe /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: '活動登録' }));
    await screen.findByText(kind === 'cattle' ? /試験母牛/ : /試験子牛/);
    await user.click(screen.getByRole('button', { name: /個体の記録/ }));

    const location = new URL(screen.getByTestId('location').textContent || '', 'https://fixture.invalid');
    expect(location.pathname).toBe('/activities/new');
    expect(location.searchParams.get('type')).toBe('animal');
    expect(location.searchParams.get('animalKind')).toBe(kind);
    expect(location.searchParams.get('animalId')).toBe(String(id));
    expect(location.searchParams.get('returnTo')).toBe(path);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('個体詳細から農場作業を開いても個体を引き継がない', async () => {
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([
      { id: 101, name: '試験母牛', earTag: '0123', birthday: '2020-01-01' },
    ] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/cattle/101']}><GlobalAnimalSearch /><LocationProbe /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: '活動登録' }));
    await screen.findByText(/試験母牛/);
    await user.click(screen.getByRole('button', { name: /農場作業/ }));

    const location = new URL(screen.getByTestId('location').textContent || '', 'https://fixture.invalid');
    expect(location.pathname).toBe('/activities/new');
    expect(location.searchParams.get('type')).toBe('farm');
    expect(location.searchParams.has('animalKind')).toBe(false);
    expect(location.searchParams.has('animalId')).toBe(false);
    expect(location.searchParams.has('targetNumber')).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

});
