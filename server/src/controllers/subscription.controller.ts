import { Request, Response } from 'express';
import { subscriptionService } from '../application/services/subscription.service';
import { paystackService } from '../infrastructure/payment/paystack.service';

/**
 * Get current subscription
 * GET /api/subscriptions/current
 */
export const getCurrentSubscription = async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const status = await subscriptionService.getCurrentSubscription(organizationId);

    if (!status) {
      return res.json({
        subscription: null,
        isActive: false,
        isTrial: false,
        isExpired: false,
        isCancelled: false,
        message: 'No subscription found',
      });
    }

    return res.json({
      subscription: status.subscription,
      isActive: status.isActive,
      isTrial: status.isTrial,
      isExpired: status.isExpired,
      isCancelled: status.isCancelled,
    });
  } catch (error: any) {
    console.error('Get current subscription error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get subscription' });
  }
};

/**
 * Cancel subscription
 * POST /api/subscriptions/cancel
 */
export const cancelSubscription = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId as string;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const subscription = await subscriptionService.cancelSubscription(organizationId, userId);

    return res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelledAt: subscription.cancelledAt,
      },
      message: 'Subscription cancelled successfully',
    });
  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    return res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
};

/**
 * Validate user limit (for adding members)
 * GET /api/subscriptions/validate-limit
 */
export const validateUserLimit = async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const currentMemberCount = await subscriptionService.getMemberCount(organizationId);
    const result = await subscriptionService.validateUserLimit(organizationId, currentMemberCount);

    return res.json({
      valid: result.valid,
      limit: result.limit,
      currentCount: currentMemberCount,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Validate user limit error:', error);
    return res.status(500).json({ error: error.message || 'Failed to validate user limit' });
  }
};

/**
 * Get payment history
 * GET /api/subscriptions/payments
 */
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const payments = await (global as any).prisma.payment.findMany({
      where: { organizationId },
      orderBy: { paidAt: 'desc' },
      take: 20,
    });

    return res.json({ payments });
  } catch (error: any) {
    console.error('Get payment history error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get payment history' });
  }
};
