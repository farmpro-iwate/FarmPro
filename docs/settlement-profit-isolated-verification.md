# Isolated settlement profit verification (2026-10-27)

This is **not** a production deployment. Do not attach the existing FarmPro production database, Render disk, existing final-test service, or any real customer account.

## Create a NEW Render Web Service

- Repository: farmpro-iwate/FarmPro
- Branch: `agent/settlement-profit-isolated-20261027`
- Name: `farmpro-settlement-profit-test` (must match exactly)
- Build command:
  `npm --prefix client ci --include=dev && npm --prefix client run build && npm --prefix server ci --include=dev && npm --prefix server run build`
- Start command: `npm --prefix server run start:settlement-preview`
- Plan: Free, **no disk**. All data is disposable.
- Never point the existing TEST5954 service at this branch.

Environment variables:

```text
NODE_ENV=production
FARMPRO_DATA_DIR=/tmp/farmpro-settlement-profit-test
FARMPRO_SETTLEMENT_WRITE_PREVIEW=enabled
VITE_SETTLEMENT_WRITE_PREVIEW=enabled
FARMPRO_ALLOWED_ORIGIN=https://farmpro-settlement-profit-test.onrender.com
FARMPRO_LINE_FULL_APP_PREVIEW=false
FARMPRO_LINE_SIGNUP_PRODUCTION=false
FARMPRO_AUTH_SECRET=<unique strong secret; enter in Render, never commit>
FARMPRO_SETTLEMENT_TEST_PASSWORD=<unique 16+ character test password; never commit>
```

The bootstrap rejects any other Render service name or data directory and creates only `settlement-preview@farmpro.invalid` in the isolated farm.

## Manual profit verification

1. Create a fake calf in this brand-new isolated farm's local cattle ledger, using ear tag `TEST5954`, and verify its real `calfId` is linked to the test sale. Do not reuse existing TEST5954 data from another service.
2. Register the sold calf for 500,000 JPY and let the sale list calculate its production cost snapshot.
3. Send the sale to cloud once using the preview button. If response is uncertain, do not retry until cloud status has been read.
4. Create one settlement: 10,000 JPY market fee; 490,000 JPY net, matched. Save once.
5. Verify: fee expense 10,000 JPY / individual calf TEST5954 exactly one record; sale list profit equals **original fixed-cost profit minus 10,000 JPY**, with original production cost unchanged.
6. Reload/re-login and verify same values without resubmitting settlement.

Production cost is not automatically 200,000 JPY: that number is only an arithmetic example. Use the production cost displayed for the fake calf.

Never promote this branch or deploy it to the existing service before a successful isolated test and review.
