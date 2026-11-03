import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedingGuideList } from './FeedingGuideList';
import * as repository from '../storage/repository';
import * as guides from '../services/feedingGuideApi';

const event = { date: '2026-11-02', reason: '記録済み', note: '', recordedAt: '2026-11-02T00:00:00Z' };
const calves = [
  { id: 'calf-live', name: '生存子牛', birthday: '2026-08-01' },
  { id: 'calf-dead', name: '死亡子牛', birthday: '2026-08-01', lifecycle: { version: 1, death: event } },
  { id: 'calf-legacy', name: '旧死亡子牛', birthday: '2026-08-01', managementStatus: '死亡・その他' },
  { id: 'calf-culled', name: '廃用後も飼育中の子牛', birthday: '2026-08-01', lifecycle: { version: 1, culling: { ...event, route: 'fattening' } } },
].map(row => Object.freeze(row));
const feedings = calves.map((calf, index) => Object.freeze({
  id: `feeding-${index}`, calfId: calf.id, date: '2026-11-01', starterAmount: '1',
}));
const guide = { id: 'guide-1', ageDays: '90', stageName: '育成', starterAmount: '2', growingFeedAmount: '0', roughageAmount: '0' };

describe('current feeding checks after a lifecycle decision', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    vi.spyOn(guides, 'getFeedingGuideList').mockResolvedValue([guide] as any);
    vi.spyOn(repository, 'getAllRecords').mockImplementation(async store =>
      (store === 'calves' ? calves : store === 'feedings' ? feedings : []) as any);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('stops deceased shortage alerts while retaining living/culling care and every saved feeding record', async () => {
    const before = JSON.stringify({ calves, feedings });
    const save = vi.spyOn(repository, 'saveRecord');
    const remove = vi.spyOn(repository, 'deleteRecord');
    render(<MemoryRouter><FeedingGuideList /></MemoryRouter>);
    expect(await screen.findByText('不足気味の子牛：2頭')).toBeInTheDocument();
    expect(screen.getByText('生存子牛')).toBeInTheDocument();
    expect(screen.getByText('廃用後も飼育中の子牛')).toBeInTheDocument();
    expect(screen.queryByText('死亡子牛')).not.toBeInTheDocument();
    expect(screen.queryByText('旧死亡子牛')).not.toBeInTheDocument();
    expect(screen.getByText(/飼料給与実績 読み込み件数：4件/)).toBeInTheDocument();
    expect(JSON.stringify({ calves, feedings })).toBe(before);
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('explains that no current feeding target remains when only deceased calves exist', async () => {
    vi.mocked(repository.getAllRecords).mockImplementation(async store =>
      (store === 'calves' ? calves.filter(calf => calf.id === 'calf-dead' || calf.id === 'calf-legacy') : feedings) as any);
    render(<MemoryRouter><FeedingGuideList /></MemoryRouter>);
    expect(await screen.findByText('給与アラートの対象となる子牛はいません。')).toBeInTheDocument();
    expect(screen.queryByText(/不足気味の子牛：/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV出力' })).toBeDisabled();
  });
});
