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
  it('死亡牛は新しい治療や繁殖を出さず、対象を引き継いで死亡記録を確認できる', async () => {
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ id: 101, earTag: '0123', name: '死亡試験牛',
      lifecycle: { version: 1, death: { date: '2020-01-01', reason: '試験', note: '', recordedAt: '2020-01-01T00:00:00Z' } } }] as any);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/cattle/101']}><GlobalAnimalSearch /><LocationProbe /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
    await screen.findByText(/死亡履歴として保存されています/);
    expect(screen.queryByRole('button', { name: /種付|ワクチン|出荷・販売/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '死亡・廃用の記録を確認' }));
    const location = new URL(screen.getByTestId('location').textContent || '', 'https://fixture.invalid');
    expect(location.pathname).toBe('/animal-lifecycle/new');
    expect(location.searchParams.get('animalKind')).toBe('cattle');
    expect(location.searchParams.get('animalId')).toBe('101');
    expect(location.searchParams.get('returnTo')).toBe('/cattle/101');
  });

  it('廃用牛は繁殖の操作を隠し、治療と出荷を残す', async () => {
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ id: 101, earTag: '0123', name: '廃用試験牛',
      lifecycle: { version: 1, culling: { date: '2020-01-01', reason: '試験', note: '', route: 'fattening', recordedAt: '2020-01-01T00:00:00Z' } } }] as any);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/cattle/101']}><GlobalAnimalSearch /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
    await screen.findByText(/廃用（繁殖終了）の牛です/);
    expect(screen.queryByRole('button', { name: /種付|妊娠鑑定|分娩/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /治療/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /出荷・販売/ })).toBeInTheDocument();
  });

  it('旧状態の死亡・その他も新規の哺育や治療対象から外す', async () => {
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{ id: 202, calfNumber: '0456', name: '旧死亡試験子牛', managementStatus: '死亡・その他' }] as any);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/calves/202']}><GlobalAnimalSearch /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
    await screen.findByText(/死亡履歴として保存されています/);
    expect(screen.queryByRole('button', { name: /哺育|治療|出荷・販売/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '死亡・廃用の記録を確認' })).toBeInTheDocument();
  });

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

    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));

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

    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
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

    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
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
    await user.click(screen.getByRole('button', { name: 'この牛の記録' }));
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
