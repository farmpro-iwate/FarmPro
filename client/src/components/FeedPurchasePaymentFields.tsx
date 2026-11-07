import { useId } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { paymentMethodOptions, type ExpenseRecord } from '../services/expensesApi';
import { isLinkableFeedPurchaseExpense } from '../services/feedPurchaseExpenses';

export type FeedPurchasePaymentFieldsProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  paymentDate: string;
  onPaymentDateChange: (paymentDate: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (paymentMethod: string) => void;
  transactionDate: string;
  amount: string;
  supplier: string;
  disabled?: boolean;
  locked?: boolean;
  candidates: ExpenseRecord[];
  candidateMode?: 'same-payment' | 'link-existing';
  selectedExpenseId: string;
  allowSeparatePayment: boolean;
  onExpenseChoiceChange: (expenseId: string, allowSeparatePayment: boolean) => void;
};

const fieldGrid = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
  minWidth: 0,
};

function yen(value: string) {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount)
    ? amount.toLocaleString('ja-JP') + '円'
    : '未入力';
}

/** Payment inputs only; the enclosing form owns validation, confirmation, and saving. */
export function FeedPurchasePaymentFields({
  enabled,
  onEnabledChange,
  paymentDate,
  onPaymentDateChange,
  paymentMethod,
  onPaymentMethodChange,
  transactionDate,
  amount,
  supplier,
  disabled = false,
  locked = false,
  candidates,
  candidateMode = 'same-payment',
  selectedExpenseId,
  allowSeparatePayment,
  onExpenseChoiceChange,
}: FeedPurchasePaymentFieldsProps) {
  const id = useId();
  const selectedExpense = candidates.find(expense =>
    expense.id === selectedExpenseId && isLinkableFeedPurchaseExpense(expense));
  const choice = selectedExpense
    ? 'existing:' + selectedExpense.id
    : allowSeparatePayment ? 'new-payment' : '';

  return <Box component="section" aria-labelledby={id + '-title'} sx={{
    p: { xs: 1.5, sm: 2 }, border: '1px solid', borderColor: 'divider', borderRadius: 2, minWidth: 0,
  }}>
    <Stack spacing={2}>
      <Box>
        <Typography id={id + '-title'} component="h2" variant="subtitle1" fontWeight={700}>
          支払い・経費
        </Typography>
        <FormControlLabel
          control={<Checkbox
            checked={enabled}
            onChange={(_, checked) => onEnabledChange(checked)}
            disabled={disabled || locked}
            inputProps={{ 'aria-describedby': id + '-enabled-help' }}
            sx={{ minWidth: 44, minHeight: 44 }}
          />}
          label="経費にも登録する"
          sx={{ m: 0, minHeight: 44 }}
        />
        <Typography id={id + '-enabled-help'} variant="body2" color="text.secondary">
          {enabled
            ? locked
              ? '入庫は登録済みです。支払内容を確認してください。'
              : '未払いの場合はチェックを外すと、入庫だけ登録できます。'
            : '入庫だけ登録します。経費は支払後に登録できます。'}
        </Typography>
      </Box>

      {enabled && <>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            上の金額（税込）と仕入先を使います。
          </Typography>
          <Box component="dl" sx={{ ...fieldGrid, m: 0, gap: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="body2" color="text.secondary">金額（税込）</Typography>
              <Typography component="dd" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{yen(amount)}</Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="body2" color="text.secondary">仕入先</Typography>
              <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{supplier.trim() || '未入力'}</Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={fieldGrid}>
          <Stack spacing={1} sx={{ minWidth: 0 }}>
            <TextField
              id={id + '-payment-date'}
              type="date"
              label="支払日"
              value={paymentDate}
              onChange={event => onPaymentDateChange(event.target.value)}
              required={!selectedExpense}
              disabled={disabled}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="実際に支払った日を入力してください。"
            />
            <Button
              type="button"
              variant="outlined"
              onClick={() => onPaymentDateChange(transactionDate)}
              disabled={disabled || !transactionDate}
              sx={{ alignSelf: 'flex-start', minHeight: 44 }}
            >入庫日と同じ</Button>
          </Stack>
          <TextField
            id={id + '-payment-method'}
            select
            label="支払方法"
            value={paymentMethod}
            onChange={event => onPaymentMethodChange(event.target.value)}
            required={!selectedExpense}
            disabled={disabled}
            fullWidth
            InputLabelProps={{ shrink: true }}
            SelectProps={{
              displayEmpty: true,
              SelectDisplayProps: { 'aria-required': selectedExpense ? undefined : true },
            }}
          >
            <MenuItem value="" sx={{ minHeight: 44 }}>選択してください</MenuItem>
            {paymentMethodOptions.map(method => <MenuItem key={method} value={method} sx={{ minHeight: 44 }}>{method}</MenuItem>)}
          </TextField>
        </Box>

        {candidates.length > 0 && <FormControl component="fieldset" disabled={disabled} sx={{ minWidth: 0 }}>
          <FormLabel id={id + '-choice-title'} component="legend" sx={{ fontWeight: 600, color: 'text.primary' }}>
            登録済みの経費を確認
          </FormLabel>
          <Typography id={id + '-choice-help'} variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
            {candidateMode === 'link-existing'
              ? '同じ金額・仕入先の経費です。この入庫の支払いとして登録済みのものを選んでください。'
              : '同じ支払日・金額・仕入先の経費があります。同じ支払いか選んでください。'}
          </Typography>
          <RadioGroup
            name={id + '-expense-choice'}
            aria-labelledby={id + '-choice-title'}
            aria-describedby={id + '-choice-help'}
            value={choice}
            onChange={(_, value) => {
              if (value === 'new-payment') onExpenseChoiceChange('', true);
              else {
                const expense = candidates.find(item => 'existing:' + item.id === value);
                if (expense && isLinkableFeedPurchaseExpense(expense)) onExpenseChoiceChange(expense.id, false);
              }
            }}
            sx={{ gap: 1 }}
          >
            {candidates.map(expense => {
              const linkable = isLinkableFeedPurchaseExpense(expense);
              return <FormControlLabel
              key={expense.id}
              value={'existing:' + expense.id}
              control={<Radio disabled={disabled || !linkable} sx={{ minWidth: 44, minHeight: 44 }} />}
              disabled={disabled || !linkable}
              disableTypography
              label={<Box component="span" sx={{ display: 'block', minWidth: 0, py: 0.5, overflowWrap: 'anywhere' }}>
                <Typography component="span" sx={{ display: 'block', fontWeight: 600 }}>この登録済み経費を使う</Typography>
                <Box component="span" sx={{ ...fieldGrid, gap: 0.5, mt: 0.5 }}>
                  <Typography component="span" variant="body2">支払日：{expense.paymentDate || '未入力'}</Typography>
                  <Typography component="span" variant="body2">金額：{yen(expense.amount)}</Typography>
                  <Typography component="span" variant="body2">支払先：{expense.vendor || '未入力'}</Typography>
                  <Typography component="span" variant="body2">支払方法：{expense.paymentMethod || '未入力'}</Typography>
                  <Typography component="span" variant="body2" sx={{ gridColumn: '1 / -1' }}>内容：{expense.description || '未入力'}</Typography>
                </Box>
                {!linkable && <Typography component="span" variant="body2" sx={{ display: 'block', mt: 0.5 }}>
                  この経費は関連付けできません。経費管理で確認してください。
                </Typography>}
              </Box>}
              sx={{
                m: 0, p: 1, minHeight: 44, alignItems: 'flex-start', border: '1px solid', borderRadius: 1,
                borderColor: selectedExpense?.id === expense.id ? 'primary.main' : 'divider',
                bgcolor: selectedExpense?.id === expense.id ? 'action.selected' : 'transparent',
              }}
            />;
            })}
            <FormControlLabel
              value="new-payment"
              control={<Radio disabled={disabled} sx={{ minWidth: 44, minHeight: 44 }} />}
              disabled={disabled}
              label="別の支払いとして新しく登録"
              sx={{ m: 0, minHeight: 44, overflowWrap: 'anywhere' }}
            />
          </RadioGroup>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            登録済み経費を選んでも、元の支払内容は変わりません。
          </Typography>
        </FormControl>}
      </>}
    </Stack>
  </Box>;
}
