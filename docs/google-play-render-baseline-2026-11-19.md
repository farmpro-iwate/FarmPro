# Verified Render production baseline — 2026-11-19

Evidence: user-provided Render screenshot on 2026-11-19, plus read-only GitHub inspection at ref `030b012`.

| Field | Verified |
| --- | --- |
| Render service | `farmpro-app` (not `farmpro-trial`) |
| Render state at screenshot | Live |
| Repository | `farmpro-iwate/FarmPro` |
| Live branch | `agent/paid-mainline-sync` |
| Deployed commit (short SHA) | `030b012` |
| Production domain shown | `app.farmpro-app.jp` |
| `client/vite.config.ts` at `030b012` | `base: '/'` |
| `client/public/manifest.webmanifest` at `030b012` | `start_url: '/'`, `scope: '/'`, `display: 'standalone'` |

This replaces the earlier unverified assumption that `main` / `/FarmPro/` might be the Play release source. The root `/` route is the correct *configuration candidate* at this inspected commit; its live HTTP behavior has NOT been independently tested.

## Next implementation gate

1. Read-only check of actual production HTTP response, manifest and site behavior. A fresh screenshot is not sufficient to establish full content.
2. Confirm valid production icon assets and PWA installability in Android Chrome.
3. Verify application authentication, local IndexedDB isolation, synchronization and backup behavior in a disposable account. Do not use a real farmer account for testing.
4. Confirm Google Play billing compliance for the existing Stripe subscriptions before a Play-distributed app exposes purchase paths.
5. Only then choose an Android package identifier, create a test-only Bubblewrap/TWA wrapper from a verified production commit, and sign using owner-controlled keys. Do not generate or store signing secrets in this repository.

No Render deploy, Stripe changes, production records, app code changes or publication were made. This document is an audit record only.
