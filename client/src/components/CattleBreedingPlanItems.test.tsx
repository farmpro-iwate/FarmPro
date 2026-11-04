import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CattleBreedingPlanItems } from './CattleBreedingPlanItems';
import { resolveCattleBreedingPlans, type PlanAnimal, type PlanRow } from '../utils/cattleBreedingPlans';

const today = '2026-11-04';
const growingCow = { id: 123, earTag: '5754', name: '育成牛', stage: '育成牛' };
const heat = { id: 'heat-1', cowEarTag: '5754', heatDate: '2026-10-30' };

function showPlans(rows: PlanRow[], { animal = growingCow, compact = false }: { animal?: PlanAnimal; compact?: boolean } = {}) {
  const summary = resolveCattleBreedingPlans(animal, {
    breedings: rows, calvings: [], sales: [], cycleDays: 21, unavailable: [],
  }, today);
  return render(<MemoryRouter><CattleBreedingPlanItems animal={animal} summary={summary} today={today} compact={compact} /></MemoryRouter>);
}

afterEach(cleanup);

describe('growing cattle breeding record guidance', () => {
  it.each([true, false])('shows the observed heat separately from a future appointment (compact: %s)', (compact) => {
    const view = showPlans([heat], { compact });
    expect(screen.getByText('発情記録あり')).toBeInTheDocument();
    expect(screen.getByText('発情日：2026-10-30')).toBeInTheDocument();
    expect(screen.queryByText('種付方法の確認')).not.toBeInTheDocument();
    expect(screen.queryByText(/予定日：/)).not.toBeInTheDocument();
    expect(view.container.querySelector('[data-plan-kind="breeding-choice"]')).toHaveAttribute('data-plan-date', '');
    expect(screen.getByRole('link', { name: '繁殖記録を確認' })).toHaveAttribute('href',
      `/breedings/heat-1/edit?returnTo=${encodeURIComponent(compact ? '/cattle/growing' : '/cattle/123')}`);
  });

  it.each([true, false])('keeps the existing guidance for breeding cattle (compact: %s)', (compact) => {
    showPlans([heat], { animal: { ...growingCow, stage: '繁殖牛' }, compact });
    expect(screen.getByText('種付方法の確認')).toBeInTheDocument();
    expect(screen.queryByText('発情記録あり')).not.toBeInTheDocument();
    expect(screen.queryByText(/発情日：/)).not.toBeInTheDocument();
  });

  it.each([
    { name: 'AI performed', record: { ...heat, inseminationDate: '2026-10-30', breedingMethod: '種付', breedingStatus: '種付実施' },
      expected: [['next-heat', '2026-11-20'], ['pregnancy-check', '2026-12-11']] },
    { name: 'ET planned', record: { ...heat, breedingMethod: '受精卵移植', breedingStatus: '移植予定', transferPlannedDate: '2026-11-06' },
      expected: [['transfer', '2026-11-06']] },
    { name: 'ET performed', record: { ...heat, heatDate: '2026-10-27', breedingMethod: '受精卵移植', breedingStatus: '移植実施', transferDate: '2026-11-03' },
      expected: [['next-heat', '2026-11-17'], ['pregnancy-check', '2026-12-08']] },
    { name: 'confirmed pregnancy', record: { ...heat, inseminationDate: '2026-10-30', pregnancyResult: '受胎', expectedCalvingDate: '2027-08-10' },
      expected: [['calving', '2027-08-10']] },
  ])('retains the actual growing cattle plans after $name', ({ record, expected }) => {
    const view = showPlans([record], { compact: true });
    expect(screen.queryByText('発情記録あり')).not.toBeInTheDocument();
    expect(Array.from(view.container.querySelectorAll('[data-plan-kind]')).map((node) => [
      node.getAttribute('data-plan-kind'), node.getAttribute('data-plan-date'),
    ])).toEqual(expected);
    for (const [, date] of expected) expect(screen.getByText(new RegExp(date))).toBeInTheDocument();
  });

  it('does not present an invalid heat date as an observed heat', () => {
    showPlans([{ ...heat, heatDate: '2026-02-30' }], { compact: true });
    expect(screen.getByRole('alert')).toHaveTextContent('発情日・実施日が不正です。');
    expect(screen.queryByText('発情記録あり')).not.toBeInTheDocument();
  });
});
