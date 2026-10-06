import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeTaskSections, type HomeTaskItem } from './HomeTaskSections';

const today = '2026-10-05';
const items: HomeTaskItem[] = [
  { id: 'b', status: '近日中', plannedDate: '2026-10-07', content: <a href="/breedings">Future breeding</a> },
  { id: 't', status: '注意', plannedDate: today, content: <a href="/treatments/new?sourceTreatmentId=1">Treatment today</a> },
  { id: 'w', status: '注意', content: <a href="/treatments">Withdrawal</a> },
  { id: 'o', status: '期限超過', plannedDate: '2026-10-04', content: <a href="/schedules">Overdue task</a> },
];

afterEach(cleanup);

describe('home task sections', () => {
  it('shows each existing card in one section and keeps its destination', () => {
    render(<HomeTaskSections items={items} today={today} />);
    const due = screen.getByRole('region', { name: '今日の対応' });
    const upcoming = screen.getByRole('region', { name: '近日の対応' });
    const ongoing = screen.getByRole('region', { name: '継続中・確認事項' });
    expect(within(due).getAllByRole('link').map((link) => link.textContent)).toEqual(['Overdue task', 'Treatment today']);
    expect(within(due).getByText('2 件')).toBeInTheDocument();
    expect(within(due).getByRole('link', { name: 'Treatment today' })).toHaveAttribute('href', '/treatments/new?sourceTreatmentId=1');
    expect(within(upcoming).getByRole('link', { name: 'Future breeding' })).toHaveAttribute('href', '/breedings');
    expect(within(ongoing).getByText('Withdrawal')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(due.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upcoming.compareDocumentPosition(ongoing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not claim there are no tasks before loading finishes', () => {
    const view = render(<HomeTaskSections items={[]} today={today} loading />);
    expect(screen.getByText('対応予定を確認しています...')).toBeInTheDocument();
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
    expect(screen.queryByText(/予定はありません/)).not.toBeInTheDocument();
    view.rerender(<HomeTaskSections items={[]} today={today} />);
    expect(screen.getByText('今日の対応予定はありません。')).toBeInTheDocument();
    expect(screen.getByText('近日の対応予定はありません。')).toBeInTheDocument();
    expect(screen.getAllByText('0 件')).toHaveLength(3);
  });

  it('keeps available tasks visible but withholds reassuring empty counts on a read error', () => {
    render(<HomeTaskSections items={[items[1]]} today={today} issues={['治療記録の一部を確認できません。']} />);
    expect(screen.getByRole('alert')).toHaveTextContent('治療記録の一部を確認できません。');
    expect(screen.getByText('Treatment today')).toBeInTheDocument();
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
    expect(screen.queryByText(/予定はありません/)).not.toBeInTheDocument();
  });
});
