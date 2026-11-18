import type { SaleRecord } from '../services/salesApi';
import { isSameSaleAnimal } from './saleDuplicateGuard';

/**
 * Read-only view of obsolete shipping plans. No sale/settlement/expense or
 * IndexedDB/cloud record is changed. Only classify unambiguous 1:1 matches.
 */
export function findSupersededShippingPlans(rows: SaleRecord[]): SaleRecord[] {
  const planned = rows.filter(row => row.targetType === '子牛' && row.status === '出荷予定');
  const sold = rows.filter(row => row.targetType === '子牛' && row.status === '販売済み');
  return planned.filter(plan => {
    if (!plan.shippingPlanDate || plan.saleDate || plan.shippingDate || plan.salePrice) return false;
    const matches = sold.filter(sale =>
      Boolean(sale.saleDate && sale.salePrice && sale.saleDate === plan.shippingPlanDate) &&
      isSameSaleAnimal(plan, sale) &&
      // Do not silently hide a plan based on the ear tag alone.
      Boolean(plan.targetNumber && sale.targetNumber && plan.targetNumber.trim() === sale.targetNumber.trim()) &&
      Boolean(plan.birthday && sale.birthday && plan.birthday.slice(0, 10) === sale.birthday.slice(0, 10)) &&
      !(plan.calfId && sale.calfId && String(plan.calfId) !== String(sale.calfId))
    );
    if (matches.length !== 1) return false;
    // Never choose one arbitrarily if several plans correspond to this sale.
    const otherPlans = planned.filter(other =>
      other.id !== plan.id && other.shippingPlanDate === plan.shippingPlanDate &&
      isSameSaleAnimal(other, matches[0]));
    return otherPlans.length === 0;
  });
}
