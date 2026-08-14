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

const feedbackFormUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header';

type PaidPlanId = Exclude<FarmProPlanId, 'free'>;
type BillingPeriod = 'monthly' | 'yearly';

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

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

export function PaidPlanApplicationPage() {
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get('plan') === 'pro' ? 'pro' : 'standard';
  const initialBilling: BillingPeriod = searchParams.get('billing') === 'yearly' ? 'yearly' : 'monthly';
  const [planId, setPlanId] = useState<PaidPlanId>(initialPlan);
  const [billing, setBilling] = useState<BillingPeriod>(initialBilling);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [confirmedPrice, setConfirmedPrice] = useState(false);

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

  const canProceed = agreedTerms && confirmedPrice;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>有料プランのお申し込み</Typography>
        <Typography color="text.secondary">プランと契約期間を選び、申込前の重要事項を確認してください。</Typography>
      </Stack>

      <Alert severity="info">
        現在は決済機能の準備中です。この画面で確認しても契約や課金は自動では成立しません。
      </Alert>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" fontWeight={800}>1. プランを選ぶ</Typography>
            <TextField select label="プラン" value={planId} onChange={(event) => setPlanId(event.target.value as PaidPlanId)} fullWidth>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="pro">Pro</MenuItem>
            </TextField>
            <TextField select label="支払期間" value={billing} onChange={(event) => setBilling(event.target.value as BillingPeriod)} fullWidth>
              <MenuItem value="monthly">月額</MenuItem>
              <MenuItem value="yearly">年額</MenuItem>
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
                <TableRow><TableCell>今回確認する支払総額</TableCell><TableCell><strong>{yen(price.taxIncluded)}（税込）</strong></TableCell></TableRow>
                <TableRow><TableCell>契約期間</TableCell><TableCell>{price.period}</TableCell></TableRow>
                <TableRow><TableCell>更新</TableCell><TableCell>更新条件は実際の申込手続き画面で最終表示します。現段階では自動更新は開始されません。</TableCell></TableRow>
                <TableRow><TableCell>解約</TableCell><TableCell>次回更新日前までに運営者へ申し出ることで次回更新を停止できます。</TableCell></TableRow>
                <TableRow><TableCell>途中解約の返金</TableCell><TableCell>法令上必要な場合等を除き、利用期間途中の日割り返金は原則行いません。</TableCell></TableRow>
                <TableRow><TableCell>利用開始</TableCell><TableCell>決済・入金確認後、原則として直ちに利用開始できます。</TableCell></TableRow>
              </TableBody>
            </Table>
            <Alert severity="warning">
              決済機能を追加する際は、実際に適用される自動更新の有無、更新日、支払方法を申込確定直前にもう一度表示します。
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>3. 規約と表示を確認</Typography>
            <Button component={RouterLink} to="/terms" variant="outlined" fullWidth>利用規約を確認</Button>
            <Button component={RouterLink} to="/privacy" variant="outlined" fullWidth>プライバシーポリシーを確認</Button>
            <Button component={RouterLink} to="/commerce" variant="outlined" fullWidth>特定商取引法に基づく表記を確認</Button>
            <FormControlLabel
              control={<Checkbox checked={agreedTerms} onChange={(event) => setAgreedTerms(event.target.checked)} />}
              label="利用規約・プライバシーポリシー・特定商取引法に基づく表記を確認しました。"
            />
            <FormControlLabel
              control={<Checkbox checked={confirmedPrice} onChange={(event) => setConfirmedPrice(event.target.checked)} />}
              label={`支払総額 ${yen(price.taxIncluded)}（税込）、契約期間 ${price.period}、解約・返金条件を確認しました。`}
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={800}>4. 申込手続きへ</Typography>
            <Alert severity="info">現段階では、下のボタンから運営者へ連絡して申込手続きを進めます。ボタンを押しただけでは契約や課金は発生しません。</Alert>
            <Button
              component="a"
              href={canProceed ? feedbackFormUrl : undefined}
              target={canProceed ? '_blank' : undefined}
              rel={canProceed ? 'noopener noreferrer' : undefined}
              variant="contained"
              size="large"
              disabled={!canProceed}
              fullWidth
              sx={{ minHeight: 56, fontWeight: 900 }}
            >
              申込について問い合わせる
            </Button>
            {!canProceed && <Typography color="text.secondary">上の2つの確認にチェックすると進めます。</Typography>}
          </Stack>
        </CardContent>
      </Card>

      <Button component={RouterLink} to="/settings" variant="text">設定へ戻る</Button>
    </Stack>
  );
}

export default PaidPlanApplicationPage;
