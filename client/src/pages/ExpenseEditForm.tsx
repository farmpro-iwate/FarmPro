import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  emptyExpenseInput,
  ExpenseInput,
  getExpense,
  paymentMethodOptions,
  recordToInput,
  updateExpense
} from '../services/expensesApi';
import { ExpenseCategorySearchField } from '../components/ExpenseCategorySearchField';
import { MenuItem } from '@mui/material';

export function ExpenseEditForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState<ExpenseInput>(emptyExpenseInput);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('経費IDがありません。');
        setLoading(false);
        return;
      }

      try {
        const record = await getExpense(id);
        setForm(recordToInput(record));
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '経費記録を取得できませんでした。');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!id) {
      setError('経費IDがありません。');
      return;
    }

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
      await updateExpense(id, form);
      navigate('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : '経費記録を更新できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Typography>読み込み中...</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={800}>
        経費 編集
      </Typography>

      <Alert severity="info">
        登録済みの経費記録を修正できます。金額は円マークやカンマを入れず、数字だけで入力してください。
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
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    label="支払先"
                    value={form.vendor}
                    onChange={(e) => updateField('vendor', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    label="金額"
                    value={form.amount}
                    onChange={(e) => updateField('amount', e.target.value)}
                    fullWidth
                    required
                  />
                </Grid>

                <Grid item xs={12} md={8}>
                  <TextField
                    label="対象"
                    value={form.target}
                    onChange={(e) => updateField('target', e.target.value)}
                    fullWidth
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    label="メモ"
                    value={form.memo}
                    onChange={(e) => updateField('memo', e.target.value)}
                    fullWidth
                    multiline
                    minRows={3}
                  />
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? '更新中...' : '更新'}
                </Button>
                <Button variant="outlined" onClick={() => navigate('/expenses')} disabled={saving}>
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
