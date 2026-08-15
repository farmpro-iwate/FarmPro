import { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { FarmProPlanId } from '../plans/policy';
import { getStoredAuthUser } from '../services/authClient';

const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

type PaidPlanId = Exclude<FarmProPlanId, 'free'>;
type BillingPeriod = 'monthly' | 'yearly';
type PaymentMethod = 'card' | 'bank';

type PlanOffer = {
  id: PaidPlanId;
  label: string;
  maxBreedingFemales: string;
  monthlyTaxIncluded: number;
  monthlyTaxExcluded: number;
  yearlyTaxIncluded: number;
  yearlyTaxExcluded: number;
};

const offers: Record<PaidPlanId, PlanOffer> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    maxBreedingFemales: '繁殖雌牛99頭まで',
    monthlyTaxIncluded: 1650,
    monthlyTaxExcluded: 1500,
    yearlyTaxIncluded: 18150,
    yearlyTaxExcluded: 16500,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxBreedingFemales: '繁殖雌牛100頭以上・頭数無制限',
    monthlyTaxIncluded: 3300,
    monthlyTaxExcluded: 3000,
    yearlyTaxIncluded: 36300,
    yearlyTaxExcluded: 33000,
  },
};

const stripePaymentLinks: Record<PaidPlanId, Record<BillingPeriod, string>> = {
  standard: {
    monthly: 'https://buy.stripe.com/eVq9AT0LB4mI21j02XeME00',
    yearly: 'https://buy.stripe.com/6oUdR92TJ6uQcFXg1VeME01',
  },
  pro: {
    monthly: 'https://buy.stripe.com/eVq6oHeCrg5qgWd6r1eME02',
    yearly: 'https://buy.stripe.com/5kQ9AT79Z8CYcFX5nheME03',
  },
};

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

export function PaidPlanApplicationPage() {
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get('plan') === 'pro' ? 'pro' : 'standard';
  const initialBilling: BillingPeriod = searchParams.get('billing') === 'yearly' ? 'yearly' : 'monthly';
  const [planId, setPlanId] = useState<PaidPlanId>(initialPlan);
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedPrice, setConfirmedPrice] = useState(false);
  const authUser = getStoredAuthUser();

  const offer = offers[planId];
  const price = useMemo(() => {
    if (billing === 'yearly') {
      return {
        taxIncluded: offer.yearlyTaxIncluded,
        taxExcluded: offer.yearlyTaxExcluded,
        label: '年額',
        period: '1年',
      };
    }
    return {
      taxIncluded: offer.monthlyTaxIncluded,
      taxExcluded: offer.monthlyTaxExcluded,
      label: '月額',
      period: '1か月',
    };
  }, [billing, offer]);

  const isCard = paymentMethod === 'card';
  const cardPaymentUrl = useMemo(() => {
    if (!authUser) return '';
    const url = new URL(stripePaymentLinks[planId][billing]);
    url.searchParams.set('client_reference_id', authUser.id);
    url.searchParams.set('locked_prefilled_email', authUser.email);
    return url.toString();
  }, [authUser, billing, planId]);
  const canProceed = agreedTerms && confirmedPrice && (!isCard || Boolean(cardPaymentUrl));

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>有料プランのお申し込み</Typography>
        <Typography color="text.secondary">プラン、契約期間、支払方法を選び、申込前の重要事項を確認してください。</Typography>
      </Stack>

      <Alert severity="info">有料プランは、クレジットカードまたは銀行振込でお申し込みいただけます。</Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>1. プランと支払方法を選ぶ</Typography>
            <TextField select label="プラン" value={planId} onChange={(event) => setPlanId(event.target.value as PaidPlanId)} fullWidth>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="pro">Pro</MenuItem>
            </TextField>
            <TextField select label="支払期間" value={billing} onChange={(event) => setBilling(event.target.value as BillingPeriod)} fullWidth>
              <MenuItem value="monthly">月額</MenuItem>
              <MenuItem value="yearly">年額</MenuItem>
            </TextField>
            <TextField select label="支払方法" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} fullWidth>
              <MenuItem value="card">クレジットカード</MenuItem>
              <MenuItem value="bank">銀行振込</MenuItem>
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>2. 申込内容を確認</Typography>
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>プラン</TableCell><TableCell>{offer.label}</TableCell></TableRow>
                <TableRow><TableCell>利用上限</TableCell><TableCell>{offer.maxBreedingFemales}</TableCell></TableRow>
                <TableRow><TableCell>料金</TableCell><TableCell>{price.label} {yen(price.taxIncluded)}（税込・税抜{yen(price.taxExcluded)}）</TableCell></TableRow>
                <TableRow><TableCell>支払方法</TableCell><TableCell>{isCard ? 'クレジットカード（Stripe）' : '銀行振込'}</TableCell></TableRow>
                <TableRow><TableCell>契約期間</TableCell><TableCell>{price.period}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>3. 確認</Typography>
            <FormControlLabel control={<Checkbox checked={agreedTerms} onChange={(event) => setAgreedTerms(event.target.checked)} />} label="利用規約・プライバシーポリシー・特定商取引法に基づく表記を確認しました。" />
            <FormControlLabel control={<Checkbox checked={confirmedPrice} onChange={(event) => setConfirmedPrice(event.target.checked)} />} label={`${isCard ? 'クレジットカード' : '銀行振込'}での支払総額 ${yen(price.taxIncluded)}（税込）、契約期間 ${price.period}を確認しました。`} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>4. 申込手続きへ</Typography>
            {isCard ? (
              <>
                {!authUser && <Alert severity="warning">カード払いを利用するには、FarmProへログインしてください。</Alert>}
                <Button component="a" href={canProceed ? cardPaymentUrl : undefined} target={canProceed ? '_blank' : undefined} rel={canProceed ? 'noopener noreferrer' : undefined} variant="contained" size="large" disabled={!canProceed} fullWidth>Stripeでカード払いへ進む</Button>
              </>
            ) : (
              <Button component="a" href={canProceed ? feedbackFormUrl : undefined} target={canProceed ? '_blank' : undefined} rel={canProceed ? 'noopener noreferrer' : undefined} variant="contained" size="large" disabled={!canProceed} fullWidth>銀行振込で申し込む</Button>
            )}
            {!canProceed && <Typography color="text.secondary">上の2つの確認にチェックすると進めます。</Typography>}
          </Stack>
        </CardContent>
      </Card>

      <Button component={RouterLink} to="/settings" variant="text">設定へ戻る</Button>
    </Stack>
  );
}

export default PaidPlanApplicationPage;
