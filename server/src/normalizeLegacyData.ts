import fs from 'fs';
import path from 'path';

function readJsonArray(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath: string, rows: any[]) {
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8');
}

export function normalizeLegacyReportFields() {
  const dataDir = path.join(process.cwd(), 'src', 'data');

  const salesPath = path.join(dataDir, 'sales.json');
  const sales = readJsonArray(salesPath);
  let salesChanged = false;

  const normalizedSales = sales.map((sale) => {
    const salePrice = sale.salePrice ?? sale.amount ?? sale.totalAmount ?? '';
    const amount = sale.amount ?? sale.totalAmount ?? sale.salePrice ?? '';

    if (sale.salePrice !== salePrice || sale.amount !== amount || sale.totalAmount !== amount) {
      salesChanged = true;
    }

    return {
      ...sale,
      salePrice,
      amount,
      totalAmount: amount
    };
  });

  if (salesChanged) writeJsonArray(salesPath, normalizedSales);

  const expensesPath = path.join(dataDir, 'expenses.json');
  const expenses = readJsonArray(expensesPath);
  let expensesChanged = false;

  const normalizedExpenses = expenses.map((expense) => {
    const paymentDate = expense.paymentDate ?? expense.expenseDate ?? '';
    const expenseDate = expense.expenseDate ?? expense.paymentDate ?? '';

    if (expense.paymentDate !== paymentDate || expense.expenseDate !== expenseDate) {
      expensesChanged = true;
    }

    return {
      ...expense,
      paymentDate,
      expenseDate
    };
  });

  if (expensesChanged) writeJsonArray(expensesPath, normalizedExpenses);
}
