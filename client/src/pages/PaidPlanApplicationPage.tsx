import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
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
  yearlyTaxIncluded: number;
  yearlyTaxExcluded: number;
};

const offers: Record<PaidPlanId, PlanOffer> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    maxBreedingFemales: '登録頭数11〜50頭',
    monthlyTaxIncluded: 2750,
    monthlyTaxExcluded: 2500,
    yearlyTaxIncluded: 33000,
    yearlyTaxExcluded: 30000,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxBreedingFemales: '登録頭数51頭〜無制限',
    monthlyTaxIncluded: 5500,
    monthlyTaxExcluded: 5000,
    yearlyTaxIncluded: 66000,
    yearlyTaxExcluded: 60000,
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
  const [bankSubmitting, setBankSubmitting] = useState(false);
  const [bankMessage, setBankMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
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
  const isCard = paymentMethod === 'card';
  const price = useMemo(() => isCard ? ({
    taxIncluded: offer.monthlyTaxIncluded,
    taxExcluded: offer.monthlyTaxExcluded,
    label: '月額',
    period: '1か月',
  }) : ({
    taxIncluded: offer.yearlyTaxIncluded,
    taxExcluded: offer.yearlyTaxExcluded,
    label: '年額',
    period: '1年間',
  }), [isCard, offer]);

  const cardPaymentUrl = useMemo(() => {
    if (!authUser) return '';
    const url = new URL(stripePaymentLinks[planId]);
    url.searchParams.set('client_reference_id', authUser.id);
    url.searchParams.set('locked_prefilled_email', authUser.email);
    return url.toString();
  }, [authUser, planId]);
  const canProceed = agreedTerms && confirmedPrice && Boolean(authUser) && (!isCard || Boolean(cardPaymentUrl));

  const activeSubscription = currentSubscription?.subscription;
  const currentPlan = currentSubscription?.plan ?? authUser?.plan ?? 'free';
  const currentLimit = currentPlan === 'standard'
    ? '登録頭数50頭まで'
    : currentPlan === 'pro'
      ? '登録頭数無制限'
      : '登録頭数10頭まで';

  async function submitBankTransfer() {
    const token = getAuthToken();
    if (!token || !authUser || !canProceed) return;

    setBankSubmitting(true);
    setBankMessage(null);
    try {
      const response = await fetch('/api/bank-transfer-applications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: planId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof body?.message === 'string' ? body.message : '銀行振込のお申し込みを受け付けできませんでした');
      }

      setBankMessage({
        severity: 'success',
        text: body?.alreadyPending
          ? 'このプランの銀行振込申込はすでに受付済みです。振込先のご案内をお待ちください。'
          : '銀行振込（年払い）のお申し込みを受け付けました。登録メールアドレスへ受付確認を送信しました。',
      });
    } catch (error) {
      setBankMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : '銀行振込のお申し込みを受け付けできませんでした',
      });
    } finally {
      setBankSubmitting(false);
    }
  }

  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 1400, mx: 'auto' }}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>有料プランのお申し込み</Typography>
        <Typography color="text.secondary">クレジットカードは月払い、銀行振込は年払いです。プランと支払方法を選び、申込前の重要事項を確認してください。</Typography>
      </Stack>

      <Card>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack spacing={1.25}>
            <Typography variant="h6" fontWeight={900}>現在の契約内容</Typography>
            <Grid container spacing={1}>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">現在のプラン</Typography>
                <Typography fontWeight={800}>{planLabel(currentPlan)}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">契約状態</Typography>
                <Typography fontWeight={800}>{activeSubscription ? '契約中' : currentPlan === 'free' ? 'Free利用中' : '確認中'}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">支払期間</Typography>
                <Typography fontWeight={800}>{activeSubscription ? activeSubscription.billing === 'yearly' ? '年額' : '月額' : '-'}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">利用上限</Typography>
                <Typography fontWeight={800}>{currentLimit}</Typography>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info">10頭まではFreeで利用できます。クレジットカードは月払い、銀行振込は年払い（1年分一括）です。</Alert>

      <Grid container spacing={2} alignItems="flex-start">
      <Grid item xs={12} lg={5}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>1. プランと支払方法を選ぶ</Typography>
            <TextField select label="プラン" value={planId} onChange={(event) => { setPlanId(event.target.value as PaidPlanId); setConfirmedPrice(false); setBankMessage(null); }} size="small" fullWidth>
              <MenuItem value="standard">Standard（11〜50頭）</MenuItem>
              <MenuItem value="pro">Pro（51頭〜無制限）</MenuItem>
            </TextField>
            <TextField
              label="支払期間"
              value={isCard ? '月額' : '年額'}
              size="small"
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={isCard ? 'クレジットカードは毎月の自動決済です。' : '銀行振込は1年分をまとめてお支払いいただきます。'}
            />
            <TextField select label="支払方法" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value as PaymentMethod); setConfirmedPrice(false); setBankMessage(null); }} size="small" fullWidth>
              <MenuItem value="card">クレジットカード</MenuItem>
              <MenuItem value="bank">銀行振込</MenuItem>
            </TextField>
          </Stack>
        </CardContent>
      </Card>
      </Grid>

      <Grid item xs={12} lg={7}>
      <Stack spacing={2}>
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
            <Typography color="text.secondary">申込前に、必要な内容をこの場でもう一度確認できます。</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={RouterLink} to="/terms" variant="outlined" fullWidth>利用規約を見る</Button>
              <Button component={RouterLink} to="/privacy" variant="outlined" fullWidth>プライバシーポリシーを見る</Button>
              <Button component={RouterLink} to="/commerce" variant="outlined" fullWidth>特定商取引法の表記を見る</Button>
            </Stack>
            <FormControlLabel control={<Checkbox checked={agreedTerms} onChange={(event) => setAgreedTerms(event.target.checked)} />} label="利用規約・プライバシーポリシー・特定商取引法に基づく表記を確認しました。" />
            <FormControlLabel control={<Checkbox checked={confirmedPrice} onChange={(event) => setConfirmedPrice(event.target.checked)} />} label={`${isCard ? 'クレジットカード' : '銀行振込'}での支払総額 ${yen(price.taxIncluded)}（税込）、契約期間 ${price.period}を確認しました。`} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>4. 申込手続きへ</Typography>
            {!authUser && (
              <>
                <Alert severity="warning">有料プランを申し込むには、FarmProへログインしてください。</Alert>
                <Button component={RouterLink} to="/login" variant="contained" size="large" fullWidth>
                  FarmProへログインする
                </Button>
              </>
            )}
            {isCard ? (
              <Button component="a" href={canProceed ? cardPaymentUrl : undefined} target={canProceed ? '_blank' : undefined} rel={canProceed ? 'noopener noreferrer' : undefined} variant="contained" size="large" disabled={!canProceed} fullWidth>Stripeでカード払いへ進む</Button>
            ) : (
              <Button onClick={submitBankTransfer} variant="contained" size="large" disabled={!canProceed || bankSubmitting} fullWidth>
                {bankSubmitting ? '申し込み中…' : '銀行振込で申し込む'}
              </Button>
            )}
            {bankMessage && <Alert severity={bankMessage.severity}>{bankMessage.text}</Alert>}
            {!canProceed && authUser && <Typography color="text.secondary">上の2つの確認にチェックすると進めます。</Typography>}
          </Stack>
        </CardContent>
      </Card>
      </Stack>
      </Grid>
      </Grid>

      <Button component={RouterLink} to="/settings" variant="text">設定へ戻る</Button>
    </Stack>
  );
}

export default PaidPlanApplicationPage;
