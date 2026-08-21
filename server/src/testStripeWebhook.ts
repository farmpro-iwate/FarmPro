import crypto from 'node:crypto';

const [, , command, target, extra] = process.argv;
const secret = process.env.STRIPE_WEBHOOK_TEST_SECRET?.trim();
const port = process.env.PORT?.trim() || '4000';
const endpoint = `http://127.0.0.1:${port}/api/stripe/webhook`;

if (!secret) {
  console.error('STRIPE_WEBHOOK_TEST_SECRET is required');
  process.exit(1);
}

if (!command || !target) {
  console.error('Usage: npm run stripe:test -- upgrade <email> [standard|pro]');
  console.error('   or: npm run stripe:test -- cancel <subscriptionId>');
  process.exit(1);
}

function signature(payload: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac('sha256', secret!).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function postEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature(payload),
    },
    body: payload,
  });

  const text = await response.text();
  console.log(`HTTP ${response.status}`);
  console.log(text);
  if (!response.ok) process.exit(1);
}

if (command === 'upgrade') {
  const plan = extra === 'pro' ? 'pro' : 'standard';
  const amountTotal = plan === 'pro' ? 5500 : 2750;
  const subscriptionId = `sub_farmpro_test_${Date.now()}`;
  await postEvent({
    id: `evt_farmpro_test_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        customer_email: target,
        currency: 'jpy',
        amount_total: amountTotal,
        subscription: subscriptionId,
      },
    },
  });
  console.log(`subscriptionId=${subscriptionId}`);
  console.log(`plan=${plan}`);
} else if (command === 'cancel') {
  await postEvent({
    id: `evt_farmpro_test_cancel_${Date.now()}`,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: target,
      },
    },
  });
  console.log(`canceled=${target}`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
