---
id: hash-store-purchase
title: Hash store purchase on iOS and Android, from the store sheet to the balance, with cancel, restore and the exhausted sheet
priority: P0
environment: assisted
tags: [coins, hash, iap, purchase, store, storekit, play-billing]
taste: [T12, T16, T20, T21, T22]
paths:
  - mingle-app/src/components/coins/**
  - mingle-app/src/lib/coin-purchase-client.ts
  - mingle-app/src/lib/coin-wallet-client.ts
  - mingle-app/src/lib/native-iap.ts
  - mingle-app/src/i18n/coin-copy.ts
  - mingle-app/src/i18n/coin-detail-copy.ts
  - mingle-app/src/server/coins/**
  - mingle-app/src/server/api/controllers/shared/coins-controller.ts
  - mingle-app/src/app/api/coins/**
  - mingle-app/src/app/api/webhooks/appstore/route.ts
  - mingle-app/src/app/api/webhooks/googleplay/route.ts
  - mingle-app/rn/src/nativeIap.ts
  - mingle-app/rn/App.tsx
history:
  - 2026-11-12 — 해씨: 1해씨 단위로 빠지게, 자세한 사용 내역, 통역 첫 사용 비용 안내
---

The purchase sheet itself is the store's (StoreKit / Play Billing). The agent opens it and reads it, but **never
types a password, never signs in to a store account and never confirms a payment**: the owner confirms it on the
phone (Face ID / side button on iOS, the Play sheet on Android). Everything before and after the sheet is driven
by the agent. Run on iPhone first, then on Android (`--android`), and record both in one report.

## Preconditions

- Devbox runs with the coin keys from Vault `secret/mingle/dev`: `COIN_BILLING_ENABLED=shadow`,
  `IAP_ALLOW_SANDBOX=1`, `COIN_INTERNAL_SECRET`, `APPLE_IAP_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. The coin UI is
  shown only to accounts billed for real, so the QA account's id must be in `COIN_ENFORCE_USER_IDS`:
  1. Read the QA account's id (`GET /api/auth/session` signed in, or the local DB: `SELECT id FROM app.app_users
     WHERE email = '<qa email>'` inside `BEGIN READ ONLY; … ROLLBACK;`).
  2. If it is missing, append it (comma-separated) without dropping the ids already there:
     ```bash
     cur=$(VAULT_ADDR=http://127.0.0.1:8200 vault kv get -field=COIN_ENFORCE_USER_IDS secret/mingle/dev)
     VAULT_ADDR=http://127.0.0.1:8200 vault kv patch secret/mingle/dev COIN_ENFORCE_USER_IDS="${cur:+$cur,}<qa id>"
     ```
  3. Restart only this worktree's devbox (`scripts/devbox down` + `up` here), so the app server reloads its env.
- The local DB has the coin pricing rows (`SELECT count(*) FROM app.app_coin_pricing_rates` > 0). If not, apply
  the coin migrations to the local DB first.
- iPhone: a QA build (dev-signed, so StoreKit runs in the sandbox). The owner is signed in to a **Sandbox Apple
  Account** under Settings → Developer → Sandbox Apple Account. Products come from App Store Connect
  (`coin_1000` … `coin_100000`, all approved), so no StoreKit config file is needed.
- Android: the Google account on the phone is a **license tester** in Play Console (test purchases, never
  charged). Play Billing answers a sideloaded build only when its package and versionCode match a build on a Play
  track; if the store sheet says the item is unavailable, record the Android purchase steps as pending, not failed.
- Vault `secret/mingle/dev` also sets `COIN_FREE_GRANTS_ALLOW_EMAIL=1`: in production only Apple or Google
  accounts get the sign-up bonus, and the QA account signs up by email.
- The QA account is new or its balance is known. Note the balance (`GET /api/coins/wallet`) at the start.

## Steps

1. Open the Hash store from the conversation menu (hamburger → 해씨 상점). Screenshot it at once and again after
   2 s. Note the balance line (free · purchased), the five packs with store prices in the phone's currency, the
   price list, the terms line and the restore button.
2. Scroll the store to the bottom and back. Screenshot the price list: voice per minute, read-aloud per minute,
   typed message, photo. Compare voice per minute with the live rate (`GET /api/coins/wallet` →
   `sttCoinsPerMinute`).
3. Tap the smallest pack (1,000). Screenshot the store's own purchase sheet. **Cancel it** (the agent may tap
   Cancel / swipe the sheet down). Screenshot the store after the sheet closes.
4. Tap the 1,000 pack again. Ask the owner to confirm the payment on the phone. Screenshot the moment the sheet
   closes, then every second until the result line shows (up to 15 s).
5. Read the wallet (`GET /api/coins/wallet`) and the history (`GET /api/coins/history`). Screenshot the store's
   balance line and open "View usage" / the history.
6. Kill the app (`app terminate`) right after the next purchase is confirmed, before the success line shows:
   tap the 1,000 pack, ask the owner to confirm, and terminate the app as soon as the sheet closes. Relaunch and
   open the store. Screenshot. Then tap Restore purchases and screenshot.
7. Take the balance down to a few Hash with a revoke in devbox's `/admin/coins` (search the QA account, direction
   revoke), then type messages in room A until it reaches zero. When it hits zero, screenshot the exhausted sheet.
   Tap its charge button and check it opens the store. Grant the Hash back afterwards.
8. Switch the UI locale to English and Japanese (`overflow --locale`), and screenshot the store in each.
9. Android: repeat steps 1–6 with `--android` (step 6's restore is the Play "pending purchases" replay).

## Oracle (pass when)

- The store opens complete: balance, packs with prices and the price list arrive together, with no empty price
  or "–" placeholder after 2 s (T12, T20). The pack buttons are large and in thumb reach (T21).
- The price list matches the live rates (voice per minute equals `sttCoinsPerMinute`) (T16).
- Cancelling the store sheet leaves no error line, no spinner and no pending pack (T22).
- After a confirmed purchase the success line says the exact Hash added (1,000 for `coin_1000`), the balance line
  rises by that much within 5 s, and the wallet API and the history show one purchase lot (not two).
- A purchase interrupted by killing the app is granted on the next launch or by Restore, exactly once.
- The exhausted sheet appears once at zero, says what ran out, and its button opens the store. No feature keeps
  running silently at zero.
- Every string fits and is translated in the checked locales (T16, T17).

## Signals

- Screenshots per step, `GET /api/coins/wallet` and `/api/coins/history` before and after each purchase.
- Local DB (read-only): `app.app_iap_purchases` (one row per transaction, `environment = sandbox`),
  `app.app_coin_lots`, `app.app_coin_ledger`.
- Native logs: `logs --grep -i iap`.

## Manual follow-up

- A real-money purchase in the store build (not the QA build) on each platform, then a refund: iOS via
  reportaproblem.apple.com (check the App Store server notification `REFUND` reaches production and takes the
  unspent Hash back), Android via Play Console → Order management (check the RTDN voided purchase reaches
  `/api/webhooks/googleplay`).
- Gifting purchased Hash from a profile (10% fee) between two enforced accounts.
