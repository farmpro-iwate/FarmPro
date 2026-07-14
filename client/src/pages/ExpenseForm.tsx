import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  createExpense,
  emptyExpenseInput,
  ExpenseInput,
  paymentMethodOptions
} from '../services/expensesApi';
import { ExpenseCategorySearchField } from '../components/ExpenseCategorySearchField';
import { MenuItem } from '@mui/material';

export function ExpenseForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ExpenseInput>(emptyExpenseInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.paymentDate) {
      setError('支払日を入力してください。');
      return;
    }

    if (!form.description.trim()) {
      setError('内容を入力してください。');
      return;
    }

    if (!form.category.trim()) {
      setError('経費科目を入力してください。');
      return;
    }

    if (!form.amount.trim()) {
      setError('金額を入力してください。');
      return;
    }

    const amountNumber = Number(form.amount);
    if (Number.isNaN(amountNumber) || amountNumber < 0) {
      setError('金額は数字で入力してください。例：120000');
      return;
    }

    setSaving(true);

    try {
      await createExpense(form);
      navigate('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : '経費記録を登録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        経費 新規登録
      </Typography>

      <Alert severity="info">
        支払日、経費区分、内容、金額を中心に入力します。金額は円マークやカンマを入れず、数字だけで入力してください。
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="支払日"
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => updateField('paymentDate', e.target.value)}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <ExpenseCategorySearchField
                    value={form.category}
                    masterId={form.expenseCategoryMasterId}
                    onChange={(name, masterId) => {
                      updateField('category', name);
                      updateField('expenseCategoryMasterId', masterId);
                    }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    select
                    label="支払方法"
                    value={form.paymentMethod}
                    onChange={(e) => updateField('paymentMethod', e.target.value)}
                    fullWidth
                  >
                    {paymentMethodOptions.map((item) => (
                      <MenuItem key={item} value={item}>{item}</MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="内容"
                    placeholder="例：配合飼料 7月分"
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="支払先"
                    placeholder="例：JA、飼料会社、動物病院"
                    value={form.vendor}
                    onChange={(e) => updateField('vendor', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="金額"
                    placeholder="例：120000"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={8}>
                  <TextField
                    label="対象"
                    placeholder="例：母牛全体、育成牛群、1234 はなこ"
                    value={form.target}
                    onChange={(e) => updateField('target', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    label="メモ"
                    placeholder="例：請求書あり、7月分、領収書あり"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                </Grid>
              </Grid>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={saving} fullWidth>
                  {saving ? '登録中...' : '登録'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/expenses')} disabled={saving} fullWidth>
                  一覧へ戻る
                </Button>
              </Stack>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Stack>
  );
}
