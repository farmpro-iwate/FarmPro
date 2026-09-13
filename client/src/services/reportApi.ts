import { getSalesList, type SaleRecord } from './salesApi';

export type ManagementAnalysisMonth = {
  yearMonth: string;
  soldCount: number;
  salesTotal: number;
  productionCostTotal: number;
  profitTotal: number;
};

export type ManagementAnalysisSummary = {
  year: number;
  soldCount: number;
  salesTotal: number;
  productionCostTotal: number;
  profitTotal: number;
  averageSaleAmount: number;
  averageProductionCost: number;
  averageProfit: number;
  profitMargin: number;
  monthly: ManagementAnalysisMonth[];
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yearMonthFromDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function saleProfit(sale: SaleRecord): number {
  if (sale.profitSnapshot !== undefined && sale.profitSnapshot !== null) {
    return numberValue(sale.profitSnapshot);
  }
  return numberValue(sale.salePrice) - numberValue(sale.productionCostSnapshot);
}

export async function getReportSummary(): Promise<ManagementAnalysisSummary> {
  const sales = await getSalesList();
  const year = new Date().getFullYear();
  const yearText = String(year);
  const soldSales = (sales as SaleRecord[]).filter((sale) =>
    sale.status === '販売済み' && String(sale.saleDate || '').startsWith(yearText),
  );

  const salesTotal = soldSales.reduce((sum, sale) => sum + numberValue(sale.salePrice), 0);
  const productionCostTotal = soldSales.reduce(
    (sum, sale) => sum + numberValue(sale.productionCostSnapshot),
    0,
  );
  const profitTotal = soldSales.reduce((sum, sale) => sum + saleProfit(sale), 0);
  const soldCount = soldSales.length;

  const monthlyMap = new Map<string, ManagementAnalysisMonth>();
  for (const sale of soldSales) {
    const yearMonth = yearMonthFromDate(sale.saleDate);
    if (!yearMonth) continue;
    const row = monthlyMap.get(yearMonth) ?? {
      yearMonth,
      soldCount: 0,
      salesTotal: 0,
      productionCostTotal: 0,
      profitTotal: 0,
    };
    row.soldCount += 1;
    row.salesTotal += numberValue(sale.salePrice);
    row.productionCostTotal += numberValue(sale.productionCostSnapshot);
    row.profitTotal += saleProfit(sale);
    monthlyMap.set(yearMonth, row);
  }

  const monthly = Array.from(monthlyMap.values())
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  return {
    year,
    soldCount,
    salesTotal,
    productionCostTotal,
    profitTotal,
    averageSaleAmount: soldCount > 0 ? Math.round(salesTotal / soldCount) : 0,
    averageProductionCost: soldCount > 0 ? Math.round(productionCostTotal / soldCount) : 0,
    averageProfit: soldCount > 0 ? Math.round(profitTotal / soldCount) : 0,
    profitMargin: salesTotal > 0 ? Math.round((profitTotal / salesTotal) * 1000) / 10 : 0,
    monthly,
  };
}
