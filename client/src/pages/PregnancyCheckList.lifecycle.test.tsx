import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PregnancyCheckList } from './PregnancyCheckList';

const fixture = vi.hoisted(() => ({ cattle: [] as any[], breedings: [] as any[] }));
vi.mock('../services/api', () => ({ getCattleList: async () => fixture.cattle }));
vi.mock('../services/breedingApi', () => ({ getBreedingList: async () => fixture.breedings }));
afterEach(cleanup);

describe('妊娠鑑定一覧の死亡・廃用', () => {
  it('死亡・廃用の未鑑定記録を要対応頭数から外し、過去の記録と修正導線は残す', async () => {
    fixture.cattle = [
      { id: 1, earTag: '0001', lifecycle: { version: 1, death: { date: '2020-01-01' } } },
      { id: 2, earTag: '0002', lifecycle: { version: 1, culling: { date: '2020-01-01', route: 'fattening' } } },
      { id: 3, earTag: '0003' },
    ];
    fixture.breedings = [1, 2, 3].map(id => ({ id, cowEarTag: `000${id}`, cowName: `試験牛${id}`, breedingMethod: 'AI',
      pregnancyCheckExpectedDate: '2020-01-02', pregnancyResult: '未鑑定' }));
    render(<MemoryRouter><PregnancyCheckList /></MemoryRouter>);
    await screen.findAllByText('繁殖終了');
    const title = screen.getByText('期限切れ', { selector: 'p' });
    expect(within(title.parentElement!).getByText('1件')).toBeInTheDocument();
    expect(screen.getAllByText(/試験牛1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/試験牛2/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: '妊娠鑑定を入力' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: '鑑定内容を見る・修正' })).toHaveLength(2);
  });

  it('名前だけが同じ牛を死亡・廃用と推測して予定停止しない', async () => {
    fixture.cattle = [{ id: 1, earTag: '0001', name: '同名', lifecycle: { version: 1, death: { date: '2020-01-01' } } }];
    fixture.breedings = [{ id: 'b1', cowName: '同名', cowEarTag: '', pregnancyCheckExpectedDate: '2020-01-02', pregnancyResult: '未鑑定' }];
    render(<MemoryRouter><PregnancyCheckList /></MemoryRouter>);
    await screen.findAllByText(/同名/);
    expect(screen.queryByText('繁殖終了')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '妊娠鑑定を入力' })).toBeInTheDocument();
  });
});
