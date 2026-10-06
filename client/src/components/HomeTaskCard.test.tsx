import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeTaskCard } from './HomeTaskCard';

afterEach(cleanup);

describe('HomeTaskCard presentation', () => {
  it.each(['発情予定日', '次回発情確認', '増し飼い検討'])('keeps %s separate from the open affordance and long notes', (title) => {
    const note = '実分娩日から40日後を目安にしています。発情を確認したら登録してください。';
    render(<MemoryRouter><HomeTaskCard
      to="/cattle/123" status="近日中" statusColor="info" category="繁殖"
      date="2026-10-08" title={title} detail="耳標 0254　おと" note={note}
    /></MemoryRouter>);

    const card = screen.getByRole('link');
    expect(card).toHaveAttribute('href', '/cattle/123');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const heading = within(card).getByText(title, { exact: true });
    expect(heading).toHaveStyle({ flexShrink: '0', wordBreak: 'keep-all', maxWidth: '100%' });
    expect(within(card).getByText('2026-10-08')).toHaveStyle({ whiteSpace: 'nowrap' });
    const open = within(card).getByText('開く →');
    expect(open).toHaveStyle({ justifySelf: 'end', whiteSpace: 'nowrap' });
    expect(heading).not.toContainElement(open);
    expect(within(card).getByText(note)).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(within(card).getByText('耳標 0254 おと')).toBeInTheDocument();
  });

  it('opens the existing destination when the right-aligned affordance is clicked', () => {
    render(<MemoryRouter><Routes>
      <Route path="/" element={<HomeTaskCard
        to="/destination?sourceTreatmentId=7&returnTo=%2F"
        status="注意" statusColor="warning" title="治療中" detail="耳標 6891　子牛"
      />} />
      <Route path="/destination" element={<div>Existing destination</div>} />
    </Routes></MemoryRouter>);
    const card = screen.getByRole('link');
    expect(card).toHaveAttribute('href', '/destination?sourceTreatmentId=7&returnTo=%2F');
    fireEvent.click(within(card).getByText('開く →'));
    expect(screen.getByText('Existing destination')).toBeInTheDocument();
  });

  it('labels a market date exactly once without adding another interactive element', () => {
    render(<MemoryRouter><HomeTaskCard
      to="/market-shipping-plan" status="市場まで8日" statusColor="info"
      date="2026-10-14" dateLabel="市場日" title="体重確認"
      detail="5754 子牛（耳標未装着）　岩手中央家畜市場"
    /></MemoryRouter>);
    const card = screen.getByRole('link');
    expect(within(card).getByText('市場日：2026-10-14')).toBeInTheDocument();
    expect(card.textContent?.match(/2026-10-14/g)).toHaveLength(1);
    expect(within(card).getByText('市場まで8日')).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/market-shipping-plan');
  });

  it('does not invent a due date for an undated feed review or omit its calving note', () => {
    render(<MemoryRouter><HomeTaskCard
      to="/feedings" status="継続中" statusColor="warning" category="繁殖"
      title="増し飼い検討" detail="耳標 0476　なおこ"
      note="分娩予定日を目安に、体況と飼料内容を確認してください。 分娩予定日：2026-11-01"
    /></MemoryRouter>);
    expect(screen.getByText('増し飼い検討')).toBeInTheDocument();
    expect(screen.getByText(/分娩予定日：2026-11-01/)).toBeInTheDocument();
    expect(screen.queryByText('2026-11-01', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/市場日/)).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/feedings');
  });
});
