import { PrismaClient } from '@prisma/client';
import { paystackService } from '../../infrastructure/payment/paystack.service';
import { TRIAL_PERIOD_DAYS, getTierByUserCount } from '../../config/pricing.config';

const prisma = new PrismaClient();

interface CreateSubscriptionParams {
  userId: string;
  organizationId: string;
  plan: string;
  userCount: number;
  period: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  paystackReference?: string;
  paystackCustomerId?: string;
  paystackSubscriptionId?: string;
  paystackEmailToken?: string;
}

interface SubscriptionStatus {
  subscription: any;
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  isCancelled: boolean;
}

export class SubscriptionService {
  /**
   * Validate if a user can add more members based on subscription limit
   */
  async validateUserLimit(organizationId: string, currentMemberCount: number): Promise<{
    valid: boolean;
    limit: number;
    message?: string;
  }> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['active', 'trial'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      // No subscription, default to free tier (10 users)
      return {
        valid: currentMemberCount < 10,
        limit: 10,
        message: 'You are on the free plan. Upgrade to add more members.',
      };
    }

    const limit = subscription.userCount;

    if (currentMemberCount >= limit) {
      return {
        valid: false,
        limit,
        message: `You have reached your subscription limit of ${limit} members. Please upgrade your plan.`,
      };
    }

    return {
      valid: true,
      limit,
    };
  }

  /**
   * Create a trial subscription for new organizations
   */
  async createTrialSubscription(userId: string, organizationId: string): Promise<any> {
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['active', 'trial'],
        },
      },
    });

    if (existingSubscription) {
      return existingSubscription;
    }

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + TRIAL_PERIOD_DAYS);

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        organizationId,
        plan: 'free',
        status: 'trial',
        userCount: 10,
        period: 'monthly',
        trialStartDate: new Date(),
        trialEndDate,
        amount: 0,
        currency: 'NGN',
      },
    });

    return subscription;
  }

  /**
   * Create subscription from Paystack payment
   */
  async createSubscriptionFromPaystack(params: CreateSubscriptionParams): Promise<any> {
    const {
      userId,
      organizationId,
      plan,
      userCount,
      period,
      amount,
      currency,
      paystackReference,
      paystackCustomerId,
    } = params;

    // Check for existing active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['active', 'trial'],
        },
      },
    });

    if (existingSubscription) {
      // Update existing subscription
      return prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          plan,
          userCount,
          period,
          amount,
          currency,
          status: 'active',
          startDate: new Date(),
          paystackCustomerId: paystackCustomerId || existingSubscription.paystackCustomerId,
          paystackReference: paystackReference,
        },
      });
    }

    // Create new subscription
    return prisma.subscription.create({
      data: {
        userId,
        organizationId,
        plan,
        userCount,
        period,
        amount,
        currency,
        status: 'active',
        startDate: new Date(),
        paystackCustomerId: paystackCustomerId,
        paystackReference: paystackReference,
      },
    });
  }

  /**
   * Activate subscription after successful payment
   */
  async activateSubscription(
    organizationId: string,
    paystackReference: string,
    paystackCustomerId?: string
  ): Promise<any> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        paystackReference,
      },
    });

    if (subscription) {
      return prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          startDate: new Date(),
          paystackCustomerId: paystackCustomerId || subscription.paystackCustomerId,
        },
      });
    }

    return null;
  }

  /**
   * Get current subscription for an organization
   */
  async getCurrentSubscription(organizationId: string): Promise<SubscriptionStatus | null> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['active', 'trial'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        payments: {
          orderBy: {
            paidAt: 'desc',
          },
          take: 5,
        },
      },
    });

    if (!subscription) {
      return null;
    }

    const now = new Date();
    const isTrial = subscription.status === 'trial';
    const isExpired = subscription.trialEndDate && new Date(subscription.trialEndDate) < now;
    const isCancelled = subscription.status === 'cancelled';

    return {
      subscription,
      isActive: subscription.status === 'active',
      isTrial,
      isExpired: !!isExpired,
      isCancelled,
    };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(organizationId: string, userId: string): Promise<any> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        organizationId,
        status: {
          in: ['active', 'trial'],
        },
      },
    });

    if (!subscription) {
      throw new Error('No active subscription found');
    }

    // Disable on Paystack if we have subscription details
    if (subscription.paystackSubscriptionId && subscription.paystackEmailToken) {
      try {
        await paystackService.disableSubscription(
          subscription.paystackSubscriptionId,
          subscription.paystackEmailToken
        );
      } catch (error) {
        console.error('Failed to disable Paystack subscription:', error);
      }
    }

    return prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });
  }

  /**
   * Get member count for an organization
   */
  async getMemberCount(organizationId: string): Promise<number> {
    return prisma.organizationMember.count({
      where: { organizationId },
    });
  }
}

export const subscriptionService = new SubscriptionService();
