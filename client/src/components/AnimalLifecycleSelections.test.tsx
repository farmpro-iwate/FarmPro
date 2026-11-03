import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattlePicker } from './CattlePicker';
import { CattleMultiPicker } from './CattleMultiPicker';
import { CalfPicker } from './CalfPicker';
import { CalfFeedingWeaningList } from '../pages/CalfFeedingWeaningList';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';

const event = { date: '2026-09-01', reason: '検証', note: '', recordedAt: '2026-09-01T00:00:00Z' };
const alive = { id: 1, earTag: 'LIVE-COW', name: '在籍牛', birthday: '2020-01-01' };
const cows = [alive,
  { ...alive, id: 2, earTag: 'DEAD-COW', name: '死亡牛', lifecycle: { version: 1, death: event } },
  { ...alive, id: 3, earTag: 'CULLED-COW', name: '廃用牛', lifecycle: { version: 1, culling: { ...event, route: 'fattening' } } },
];

beforeEach(() => {
  vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue(cows as any);
  vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('lifecycle-aware animal selections', () => {
  it('keeps culled cattle available for care but not for breeding, and never offers deceased cattle', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const view = render(<CattlePicker onSelect={onSelect} />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: /LIVE-COW/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /CULLED-COW/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /DEAD-COW/ })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    view.rerender(<CattlePicker onSelect={onSelect} breedingOnly />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /LIVE-COW/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CULLED-COW/ })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not pass inactive cattle into a breeding batch selection', async () => {
    const onChange = vi.fn();
    render(<CattleMultiPicker selectedIds={['2', '3']} onChange={onChange} breedingOnly />);
    const checkbox = await screen.findByRole('checkbox', { name: /LIVE-COW/ });
    expect(screen.queryByRole('checkbox', { name: /DEAD-COW|CULLED-COW/ })).not.toBeInTheDocument();
    await userEvent.setup().click(checkbox);
    expect(onChange).toHaveBeenCalledWith([alive]);
  });

  it('excludes current and legacy deceased calves from the picker and nursing list', async () => {
    const calf = { id: 1, calfNumber: 'LIVE-CALF', name: '在籍子牛', birthday: '2026-07-01', managementStatus: '育成中' };
    vi.mocked(calfApi.getCalfList).mockResolvedValue([calf,
      { ...calf, id: 2, calfNumber: 'DEAD-CALF', name: '死亡子牛', lifecycle: { version: 1, death: event } },
      { ...calf, id: 3, calfNumber: 'LEGACY-CALF', name: '旧死亡子牛', managementStatus: '死亡・その他' },
    ] as any);
    render(<MemoryRouter><CalfPicker onSelect={vi.fn()} /><CalfFeedingWeaningList /></MemoryRouter>);
    expect(await screen.findByText('在籍子牛')).toBeInTheDocument();
    expect(screen.queryByText('死亡子牛')).not.toBeInTheDocument();
    expect(screen.queryByText('旧死亡子牛')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /LIVE-CALF/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /DEAD-CALF|LEGACY-CALF/ })).not.toBeInTheDocument();
  });
});
