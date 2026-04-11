# Paystack Payment Implementation Guide

## Overview

This document describes the Paystack payment integration for Apraizal subscriptions. The implementation follows the same pattern as Crusroad, adapted to fit the Apraizal codebase structure.

## Subscription Tiers

| Tier | Members | Monthly (NGN) | Yearly (NGN) |
|------|---------|---------------|--------------|
| Free | 10 | ₦0 | ₦0 |
| Standard 100 | 100 | ₦10,000 | ₦120,000 |
| Standard 250 | 250 | ₦25,000 | ₦300,000 |
| Standard 500 | 500 | ₦55,000 | ₦660,000 |
| Standard 1000 | 1000 | ₦110,000 | ₦1,320,000 |

**Note:** All organizations start with a 30-day free trial on the 10-member plan.

## Environment Variables

Add the following to your `.env` file:

```env
# Paystack
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key_here
# Optional: if you use a distinct webhook signing secret, set it here.
# If unset, the server uses PAYSTACK_SECRET_KEY for webhook signature verification.
PAYSTACK_WEBHOOK_SECRET=
# Optional: routing id for setups where Paystack can only call one "central" webhook.
# This value is added to transaction metadata as `webhookRouterKey`.
PAYSTACK_WEBHOOK_ROUTER_KEY=apraizal-prod
CLIENT_URL=http://localhost:5173
```

## Getting Paystack Keys

1. Sign up at [paystack.co](https://paystack.co)
2. Go to Settings → API Keys & Webhooks
3. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)
4. Create a new webhook endpoint:
   - URL: `https://your-domain.com/payments/webhook`
   - Events: `charge.success`, `subscription.create`, `subscription.disable`, `subscription.enable`
5. Ensure your webhook is signed and `PAYSTACK_SECRET_KEY` (or `PAYSTACK_WEBHOOK_SECRET` if set) matches your Paystack account.

## Recurring Subscriptions (Plan Codes)

If you want Paystack to create a subscription automatically (and emit `subscription.create` / `subscription.disable` / `subscription.enable` events),
you must pass a Paystack **plan code** when initializing a transaction.

Configure plan codes via env vars (examples):

```env
PAYSTACK_PLAN_100_MONTHLY=PLN_xxxxx
PAYSTACK_PLAN_100_YEARLY=PLN_xxxxx
PAYSTACK_PLAN_250_MONTHLY=PLN_xxxxx
PAYSTACK_PLAN_250_YEARLY=PLN_xxxxx
PAYSTACK_PLAN_500_MONTHLY=PLN_xxxxx
PAYSTACK_PLAN_500_YEARLY=PLN_xxxxx
PAYSTACK_PLAN_1000_MONTHLY=PLN_xxxxx
PAYSTACK_PLAN_1000_YEARLY=PLN_xxxxx
```

## Single Webhook Receiver (Forwarding)

If Paystack can only call one webhook URL (e.g. a central gateway service), route events using:

- `data.reference` prefix: this implementation generates references like `apz_<uuid>`.
- `data.metadata.webhookRouterKey`: set `PAYSTACK_WEBHOOK_ROUTER_KEY` and your gateway can forward only matching events.

Important: if your gateway forwards the webhook to `/payments/webhook`, it must forward the raw JSON bytes unchanged and preserve the `x-paystack-signature` header, otherwise signature verification will fail.

## Architecture

### Backend Structure

```
server/src/
├── config/
│   └── pricing.config.ts          # Subscription tier pricing
├── infrastructure/
│   └── payment/
│       └── paystack.service.ts    # Paystack API integration
├── application/
│   └── services/
│       └── subscription.service.ts # Subscription business logic
├── infrastructure/http/controllers/
│   ├── payment.controller.ts      # Payment endpoints
│   └── subscription.controller.ts # Subscription endpoints
└── routes/
    ├── payment.routes.ts          # Payment route definitions
    └── subscription.routes.ts     # Subscription route definitions
```

### Frontend Structure

```
client/src/
├── services/
│   ├── paymentService.ts          # Payment API calls
│   └── subscriptionService.ts     # Subscription API calls
├── components/
│   └── SubscriptionGuard.tsx      # Feature lock component
└── pages/
    ├── SubscriptionPage.tsx       # Main subscription management
    └── PaymentCallback.tsx        # Payment result page
```

## API Endpoints

### Payment Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/payments/initialize` | Yes | Initialize Paystack payment |
| GET | `/api/payments/verify/:reference` | Yes | Verify payment (authenticated) |
| GET | `/api/payments/verify/public/:reference` | No | Verify payment (public, for redirects) |
| POST | `/api/payments/webhook` | No | Paystack webhook handler |

### Subscription Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/subscriptions/current` | Yes | Get current subscription |
| POST | `/api/subscriptions/cancel` | Yes | Cancel subscription |
| GET | `/api/subscriptions/validate-limit` | Yes | Check member limit |
| GET | `/api/subscriptions/payments` | Yes | Payment history |

## Payment Flow

```
1. Admin navigates to Subscription page (Sidebar → Subscription)
   ↓
2. Selects plan tier (100, 250, 500, 1000 members)
   ↓
3. Chooses billing period (Monthly/Yearly)
   ↓
4. Clicks "Continue to Payment"
   ↓
5. Backend initializes Paystack payment
   - Creates payment record
   - Returns authorization URL
   ↓
6. User redirected to Paystack hosted payment page
   ↓
7. User completes payment on Paystack
   ↓
8. Paystack redirects to: /payment/callback?reference=xxx
   ↓
9. PaymentCallback page verifies payment
   - Calls backend verify endpoint
   - Activates subscription
   ↓
10. User redirected to Subscription page with success message

PARALLEL: Paystack sends webhook to /api/payments/webhook
- Backend verifies HMAC signature
- Processes charge.success event
- Updates subscription status (idempotent)
```

## Database Schema

### Subscription Model

```prisma
model Subscription {
  id                     String    @id @default(uuid())
  userId                 String
  organizationId         String
  plan                   String    @default("free")
  status                 String    @default("trial")
  period                 String    @default("monthly")
  userCount              Int       @default(10)
  startDate              DateTime?
  endDate                DateTime?
  amount                 Int?
  currency               String    @default("NGN")
  paystackCustomerId     String?
  paystackSubscriptionId String?
  paystackReference      String?
  paystackEmailToken     String?
  trialStartDate         DateTime?
  trialEndDate           DateTime?
  cancelledAt            DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
  payments               Payment[]
}
```

### Payment Model

```prisma
model Payment {
  id                     String    @id @default(uuid())
  userId                 String
  organizationId         String
  subscriptionId         String?
  amount                 Int
  currency               String    @default("NGN")
  status                 String    @default("pending")
  paystackReference      String    @unique
  paystackAccessCode     String?
  paystackAuthorizationUrl String?
  metadata               Json?
  paidAt                 DateTime?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
  subscription           Subscription?
}
```

## Features

### For Admins

1. **View Current Subscription**
   - Plan type (free, standard)
   - Member limit
   - Billing period
   - Trial end date
   - Payment history

2. **Upgrade Plan**
   - Select tier (100, 250, 500, 1000 members)
   - Choose billing period (monthly/yearly with 17% savings)
   - Direct Paystack payment

3. **Cancel Subscription**
   - Cancel anytime
   - Access until end of billing period
   - Re-subscribe anytime

4. **Member Limit Enforcement**
   - Automatic validation before adding members
   - Clear error messages when limit reached
   - Quick upgrade prompt

### Trial Period

- **Duration:** 30 days
- **Members:** Up to 10
- **Auto-expiry:** Converts to free plan after trial ends
- **Upgrade:** Can upgrade anytime during trial

## Testing

### Test Cards

Use these Paystack test cards:

- **Success:** `4084 0808 0808 0808` (any future expiry, any CVV)
- **Decline:** `4000 0000 0000 0002`

### Test Flow

1. Set test keys in `.env`:
   ```env
   PAYSTACK_SECRET_KEY=sk_test_xxx
   ```

2. Start server and client
3. Login as admin
4. Navigate to Subscription
5. Select a paid tier
6. Complete payment with test card
7. Verify subscription activates

## Webhook Setup (Local Development)

For local testing, use ngrok to expose your webhook endpoint:

```bash
# Install ngrok
brew install ngrok

# Start ngrok
ngrok http 3000

# Copy the HTTPS URL and update Paystack webhook:
# https://dashboard.paystack.co/developers/webhooks
```

## Troubleshooting

### Payment Not Activating

1. Check webhook logs in Paystack dashboard
2. Verify webhook signature is correct
3. Check server logs for errors

### "Invalid Signature" Error

- Verify `PAYSTACK_SECRET_KEY` matches your Paystack account
- Check webhook is using the correct secret (not the API key)

### Migration Fails

```bash
cd server
npx prisma generate
npx prisma migrate dev
```

## Security Considerations

1. **Never expose secret keys** in frontend code
2. **Always verify webhook signatures** before processing
3. **Use HTTPS** in production
4. **Implement idempotency** for webhooks (already implemented)
5. **Validate all payment amounts** on the backend

## Future Enhancements

- [ ] Coupon/discount codes
- [ ] Proration for mid-cycle upgrades
- [ ] Automated dunning for failed renewals
- [ ] Usage-based billing
- [ ] Multiple payment methods (card, bank transfer, USSD)

## Support

For issues or questions:
- Check Paystack documentation: https://paystack.com/docs
- Review server logs for detailed error messages
- Contact Paystack support: support@paystack.co
