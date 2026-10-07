import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import { navigateToCardPayment, requestCardPaymentEntry, type CardEntryInput } from '../services/cardPaymentEntryClient';

type Props = CardEntryInput & { disabled?: boolean };

export function CardPaymentEntryButton(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const signature = JSON.stringify([props.plan, props.amountTaxIncluded, props.termsConfirmed,
    props.priceConfirmed, props.disabled, props.user?.id, props.user?.farmId, props.user?.email]);
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const disabled = Boolean(props.disabled || !props.user || !props.termsConfirmed || !props.priceConfirmed);

  useEffect(() => {
    setError(null);
    setBusy(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [signature]);

  async function proceed() {
    if (disabled || request.current) return;
    const controller = new AbortController();
    const startedWith = signature;
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const url = await requestCardPaymentEntry(props, controller.signal);
      if (controller.signal.aborted || request.current !== controller || currentSignature.current !== startedWith) return;
      navigateToCardPayment(url);
    } catch (caught) {
      if (!controller.signal.aborted && request.current === controller && currentSignature.current === startedWith) {
        setError(caught instanceof Error ? caught.message : 'カード申込の確認ができませんでした。');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Stack spacing={1}>
      <Button onClick={proceed} variant="contained" size="large" disabled={disabled || busy} fullWidth>
        {busy ? '申込前の確認中…' : 'Stripeでカード払いへ進む'}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
