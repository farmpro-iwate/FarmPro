import { useEffect, useMemo, useState } from 'react';
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
import { getAuthToken, getStoredAuthUser } from '../services/authClient';

const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

type PaidPlanId = Exclude<FarmProPlanId, 'free'>;
type BillingPeriod = 'monthly' | 'yearly';
type PaymentMethod = 'card' | 'bank';
type SubscriptionSummary = {
  plan: FarmProPlanId;
  subscription: null | {
    plan: PaidPlanId;
    billing: BillingPeriod;
    status: 'active' | 'inactive';
  };
};

type PlanOffer = {
  id: PaidPlanId;
  label: string;
  maxBreedingFemales: string;
  monthlyTaxIncluded: number;
  monthlyTaxExcluded: number;
};

const offers: Record<PaidPlanId, PlanOffer> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    maxBreedingFemales: '登録頭数11〜50頭',
    monthlyTaxIncluded: 2750,
    monthlyTaxExcluded: 2500,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxBreedingFemales: '登録頭数51頭〜無制限',
    monthlyTaxIncluded: 5500,
    monthlyTaxExcluded: 5000,
  },
};

const stripePaymentLinks: Record<PaidPlanId, string> = {
  standard: 'https://buy.stripe.com/4gM7sL51R5qM8pH5nheME04',
  pro: 'https://buy.stripe.com/5kQ7sL1LPFbPafS99DxeME05',
};

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function planLabel(plan: FarmProPlanId) {
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

export function PaidPlanApplicationPage() {
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get('plan') === 'pro' ? 'pro' : 'standard';
  const [planId, setPlanId] = useState<PaidPlanId>(initialPlan);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedPrice, setConfirmedPrice] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionSummary | null>(null);
  const authUser = getStoredAuthUser();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/auth/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) setCurrentSubscription(data as SubscriptionSummary);
      })
      .catch(() => undefined);
  }, []);

  const offer = offers[planId];
  const price = useMemo(() => ({
    taxIncluded: offer.monthlyTaxIncluded,
    taxExcluded: offer.monthlyTaxExcluded,
    label: '月額',
    period: '1か月',
  }), [offer]);

  const isCard = paymentMethod === 'card';
  const cardPaymentUrl = useMemo(() => {
    if (!authUser) return '';
    const url = new URL(stripePaymentLinks[planId]);
    url.searchParams.set('client_reference_id', authUser.id);
    url.searchParams.set('locked_prefilled_email', authUser.email);
    return url.toString();
  }, [authUser, planId]);
  const canProceed = agreedTerms && confirmedPrice && (!isCard || Boolean(cardPaymentUrl));

  const activeSubscription = currentSubscription?.subscription;
  const currentPlan = currentSubscription?.plan ?? authUser?.plan ?? 'free';
  const currentLimit = currentPlan === 'standard'
    ? '登録頭数50頭まで'
    : currentPlan === 'pro'
      ? '登録頭数無制限'
      : '登録頭数10頭まで';

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>有料プランのお申し込み</Typography>
        <Typography color="text.secondary">初期提供は月額プランのみです。プランと支払方法を選び、申込前の重要事項を確認してください。</Typography>
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={900}>現在の契約内容</Typography>
            <Table size="small">
              <TableBody>
                <TableRow><TableCell>現在のプラン</TableCell><TableCell>{planLabel(currentPlan)}</TableCell></TableRow>
                <TableRow><TableCell>契約状態</TableCell><TableCell>{activeSubscription ? '契約中' : currentPlan === 'free' ? 'Free利用中' : '確認中'}</TableCell></TableRow>
                <TableRow><TableCell>支払期間</TableCell><TableCell>{activeSubscription ? activeSubscription.billing === 'yearly' ? '年額（既存契約）' : '月額' : '-'}</TableCell></TableRow>
                <TableRow><TableCell>利用上限</TableCell><TableCell>{currentLimit}</TableCell></TableRow>
              </TableBody>
            </Table>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info">10頭まではFreeで利用できます。有料プランはクレジットカードまたは銀行振込でお申し込みいただけます。</Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>1. プランと支払方法を選ぶ</Typography>
            <TextField select label="プラン" value={planId} onChange={(event) => setPlanId(event.target.value as PaidPlanId)} fullWidth>
              <MenuItem value="standard">Standard（11〜50頭）</MenuItem>
              <MenuItem value="pro">Pro（51頭〜無制限）</MenuItem>
            </TextField>
            <TextField label="支払期間" value="月額" fullWidth InputProps={{ readOnly: true }} helperText="年額プランはご要望に応じて今後追加予定です。" />
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
                <TableRow><TableCell>利用目安</TableCell><TableCell>{offer.maxBreedingFemales}</TableCell></TableRow>
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
                {!authUser && (
                  <>
                    <Alert severity="warning">カード払いを利用するには、FarmProへログインしてください。</Alert>
                    <Button component={RouterLink} to="/login" variant="contained" size="large" fullWidth>
                      FarmProへログインする
                    </Button>
                  </>
                )}
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
