import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { paystackService } from '../infrastructure/payment/paystack.service';
import { subscriptionService } from '../application/services/subscription.service';
import { getTierByUserCount, getPriceForTier } from '../config/pricing.config';

const prisma = new PrismaClient();

interface InitializePaymentBody {
  plan?: string; // 'free', 'standard', 'enterprise'
  billingPeriod?: 'monthly' | 'yearly';
  currency?: string;
  userCount?: number;
}

function getPaystackPlanCode(userCount: number, billingPeriod: 'monthly' | 'yearly'): string | undefined {
  const period = billingPeriod === 'yearly' ? 'YEARLY' : 'MONTHLY';
  const envKey = `PAYSTACK_PLAN_${userCount}_${period}`;
  return process.env[envKey];
}

function getWebhookRouterKey(): string {
  // Used by an upstream "single webhook" receiver to route/fan-out events.
  return "apraizal-prod";
}

/**
 * Initialize a payment
 * POST /api/payments/initialize
 */
export const initializePayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const {
      plan = 'standard',
      billingPeriod = 'monthly',
      currency = 'NGN',
      userCount = 100,
    }: InitializePaymentBody = req.body;

    // Validate userCount
    if (!userCount || userCount <= 0) {
      return res.status(400).json({ error: 'Invalid user count' });
    }

    // Get the tier
    const tier = getTierByUserCount(userCount);
    if (!tier) {
      return res.status(400).json({ error: 'Invalid plan tier' });
    }

    // Get the price for the tier
    const amount = getPriceForTier(tier, billingPeriod);

    if (amount === 0) {
      return res.status(400).json({ error: 'Free tier does not require payment' });
    }

    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get organization
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Create or get Paystack customer
    let paystackCustomerId: string | undefined;
    try {
      const customer = await paystackService.createOrGetCustomer({
        email: user.email,
        first_name: user.name || undefined,
      });
      paystackCustomerId = customer.customer_code;
    } catch (error) {
      console.error('Failed to create Paystack customer:', error);
    }

    // Optional Paystack plan code for recurring subscriptions.
    const paystackPlanCode = getPaystackPlanCode(userCount, billingPeriod);
    const webhookRouterKey = getWebhookRouterKey();

    // Initialize Paystack payment
    const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const callbackUrl = `${frontendUrl}/payment/callback`;

    // Use our own reference so we can deterministically link webhooks/subscriptions.
    const reference = `apz_${crypto.randomUUID()}`;

    const paymentData = await paystackService.initializePayment({
      email: user.email,
      amount, // Amount is already in kobo (NGN)
      reference,
      plan: paystackPlanCode,
      channels: ['card'],
      metadata: {
        reference,
        webhookRouterKey,
        userId,
        organizationId,
        plan,
        billingPeriod,
        currency,
        userCount,
        paystackCustomerId,
        paystackPlanCode,
      },
      callback_url: callbackUrl,
    });

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        organizationId,
        amount,
        currency,
        status: 'pending',
        paystackReference: paymentData.reference || reference,
        paystackAccessCode: paymentData.access_code,
        paystackAuthorizationUrl: paymentData.authorization_url,
        metadata: {
          plan,
          billingPeriod,
          userCount,
          paystackCustomerId,
          paystackPlanCode,
          webhookRouterKey,
        },
      },
    });

    return res.json({
      authorizationUrl: paymentData.authorization_url,
      reference: paymentData.reference,
      accessCode: paymentData.access_code,
      amount,
      currency,
      paymentId: payment.id,
    });
  } catch (error: any) {
    console.error('Initialize payment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initialize payment' });
  }
};

/**
 * Verify a payment (authenticated)
 * GET /api/payments/verify/:reference
 */
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const { reference } = req.params;
    const referenceStr = Array.isArray(reference) ? reference[0] : reference;

    // Get payment record first and ensure it belongs to the user.
    const payment = await prisma.payment.findUnique({
      where: { paystackReference: referenceStr },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    if (payment.userId !== userId) {
      return res.status(403).json({ error: 'Not allowed to verify this payment' });
    }

    // Verify with Paystack
    const verification = await paystackService.verifyPayment(referenceStr);

    if (verification.status !== 'success') {
      return res.status(400).json({
        error: 'Payment not successful',
        status: verification.status,
      });
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'success',
        paidAt: new Date(verification.paid_at),
        metadata: {
          ...(payment.metadata as any),
          verificationData: verification,
        },
      },
    });

    // Get organization from payment
    const organizationId = payment.organizationId;

    // Get metadata
    const metadata = payment.metadata as any;
    const plan = metadata?.plan || 'standard';
    const billingPeriod = metadata?.billingPeriod || 'monthly';
    const userCount = metadata?.userCount || 100;
    const currency = payment.currency;
    const amount = payment.amount;

    // Create or update subscription
    const subscription = await subscriptionService.createSubscriptionFromPaystack({
      userId,
      organizationId,
      plan,
      userCount,
      period: billingPeriod,
      amount,
      currency,
      paystackReference: referenceStr,
      paystackCustomerId: (payment.metadata as any)?.paystackCustomerId,
    });

    // Update payment with subscription ID
    const finalPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        subscriptionId: subscription.id,
      },
    });

    await syncPaystackSubscriptionDetails(
      subscription.id,
      (payment.metadata as any)?.paystackCustomerId,
      (payment.metadata as any)?.paystackPlanCode
    );

    return res.json({
      success: true,
      payment: {
        id: finalPayment.id,
        reference: finalPayment.paystackReference,
        amount: finalPayment.amount,
        currency: finalPayment.currency,
        status: finalPayment.status,
        paidAt: finalPayment.paidAt,
      },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        userCount: subscription.userCount,
        period: subscription.period,
        status: subscription.status,
      },
    });
  } catch (error: any) {
    console.error('Verify payment error:', error);
    return res.status(500).json({ error: error.message || 'Failed to verify payment' });
  }
};

/**
 * Verify a payment (public - for Paystack redirect)
 * GET /api/payments/verify/public/:reference
 */
export const verifyPaymentPublic = async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const referenceStr = Array.isArray(reference) ? reference[0] : reference;

    // Verify with Paystack
    const verification = await paystackService.verifyPayment(referenceStr);

    if (verification.status !== 'success') {
      return res.status(400).json({
        error: 'Payment not successful',
        status: verification.status,
      });
    }

    // Get payment record
    const payment = await prisma.payment.findUnique({
      where: { paystackReference: referenceStr },
      include: {
        subscription: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    // Update payment status if still pending
    if (payment.status === 'pending') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'success',
          paidAt: new Date(verification.paid_at),
        },
      });

      // Create or update subscription if not already done
      if (!payment.subscriptionId) {
        const metadata = payment.metadata as any;
        const plan = metadata?.plan || 'standard';
        const billingPeriod = metadata?.billingPeriod || 'monthly';
        const userCount = metadata?.userCount || 100;
        const currency = payment.currency;
        const amount = payment.amount;

        const subscription = await subscriptionService.createSubscriptionFromPaystack({
          userId: payment.userId,
          organizationId: payment.organizationId,
          plan,
          userCount,
          period: billingPeriod,
          amount,
          currency,
          paystackReference: referenceStr,
          paystackCustomerId: (payment.metadata as any)?.paystackCustomerId,
        });

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            subscriptionId: subscription.id,
          },
        });

        await syncPaystackSubscriptionDetails(
          subscription.id,
          (payment.metadata as any)?.paystackCustomerId,
          (payment.metadata as any)?.paystackPlanCode
        );
      }
    }

    // Get updated payment with subscription
    const updatedPayment = await prisma.payment.findUnique({
      where: { id: payment.id },
      include: {
        subscription: true,
      },
    });

    return res.json({
      success: true,
      payment: {
        id: updatedPayment?.id,
        reference: updatedPayment?.paystackReference,
        amount: updatedPayment?.amount,
        currency: updatedPayment?.currency,
        status: updatedPayment?.status,
        paidAt: updatedPayment?.paidAt,
      },
      subscription: updatedPayment?.subscription,
    });
  } catch (error: any) {
    console.error('Verify payment public error:', error);
    return res.status(500).json({ error: error.message || 'Failed to verify payment' });
  }
};

/**
 * Handle Paystack webhooks
 * POST /api/payments/webhook
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const rawBody: Buffer =
      (req as any).rawBody instanceof Buffer
        ? (req as any).rawBody
        : Buffer.from(JSON.stringify(req.body), 'utf-8');

    // Verify webhook signature
    const isValid = paystackService.verifyWebhookSignature(
      rawBody,
      signature
    );

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = paystackService.parseWebhookEvent(req.body);
    const eventId = event.id || crypto.createHash('sha256').update(rawBody).digest('hex');

    // Check for idempotency
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      return res.json({ received: true });
    }

    // Store webhook event
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType: event.event,
        payload: req.body,
      },
    });

    // Process event
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;
      case 'subscription.create':
        await handleSubscriptionCreate(event.data);
        break;
      case 'subscription.disable':
        await handleSubscriptionDisable(event.data);
        break;
      case 'subscription.enable':
        await handleSubscriptionEnable(event.data);
        break;
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    // Mark event as processed
    await prisma.webhookEvent.update({
      where: { eventId },
      data: { processed: true },
    });

    return res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message || 'Webhook processing failed' });
  }
};

async function handleChargeSuccess(data: any) {
  const reference = data.reference;
  const metadata = data.metadata || {};

  const payment = await prisma.payment.findUnique({
    where: { paystackReference: reference },
  });

  if (!payment || payment.status === 'success') {
    return;
  }

  // Update payment
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'success',
      paidAt: new Date(data.paid_at || Date.now()),
    },
  });

  // Create or update subscription
  const organizationId = payment.organizationId;
  const plan = metadata.plan || 'standard';
  const billingPeriod = metadata.billingPeriod || 'monthly';
  const userCount = metadata.userCount || 100;

  const subscription = await subscriptionService.createSubscriptionFromPaystack({
    userId: payment.userId,
    organizationId,
    plan,
    userCount,
    period: billingPeriod,
    amount: payment.amount,
    currency: payment.currency,
    paystackReference: reference,
    paystackCustomerId: (payment.metadata as any)?.paystackCustomerId,
  });

  // Link payment to subscription for easier lookup during redirects/admin views.
  await prisma.payment.update({
    where: { id: payment.id },
    data: { subscriptionId: subscription.id },
  });

  // Best-effort: if this was initialized with a Paystack plan code, sync subscription_code + email_token.
  const paystackCustomerId = (payment.metadata as any)?.paystackCustomerId as string | undefined;
  const paystackPlanCode = (payment.metadata as any)?.paystackPlanCode as string | undefined;
  await syncPaystackSubscriptionDetails(subscription.id, paystackCustomerId, paystackPlanCode);
}

async function syncPaystackSubscriptionDetails(
  subscriptionId: string,
  paystackCustomerId?: string,
  paystackPlanCode?: string
) {
  if (!paystackCustomerId || !paystackPlanCode) return;

  try {
    const subs = await paystackService.listSubscriptionsByCustomer(paystackCustomerId);
    const match = subs.find((s: any) => s?.plan?.plan_code === paystackPlanCode);
    if (!match?.subscription_code || !match?.email_token) return;

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        paystackSubscriptionId: match.subscription_code,
        paystackEmailToken: match.email_token,
      },
    });
  } catch (error) {
    console.error('Failed to sync Paystack subscription details:', error);
  }
}

async function handleSubscriptionCreate(data: any) {
  const subscriptionCode = data.subscription_code;
  const emailToken = data.email_token;
  const metadata = data.metadata || {};

  const referenceFromMetadata =
    metadata.reference || metadata.paystackReference || metadata.transactionReference;

  if (!referenceFromMetadata) {
    return;
  }

  const payment = await prisma.payment.findFirst({
    where: { paystackReference: referenceFromMetadata },
  });

  if (!payment) {
    return;
  }

  await prisma.subscription.updateMany({
    where: {
      organizationId: payment.organizationId,
      paystackReference: metadata.reference,
    },
    data: {
      paystackSubscriptionId: subscriptionCode,
      paystackEmailToken: emailToken,
    },
  });
}

async function handleSubscriptionDisable(data: any) {
  const subscriptionCode = data.subscription_code;

  await prisma.subscription.updateMany({
    where: { paystackSubscriptionId: subscriptionCode },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  });
}

async function handleSubscriptionEnable(data: any) {
  const subscriptionCode = data.subscription_code;

  await prisma.subscription.updateMany({
    where: { paystackSubscriptionId: subscriptionCode },
    data: {
      status: 'active',
    },
  });
}
