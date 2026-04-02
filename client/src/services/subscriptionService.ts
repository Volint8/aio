import api from './api';

export interface Subscription {
  id: string;
  userId: string;
  organizationId: string;
  plan: string;
  status: string;
  period: string;
  userCount: number;
  startDate: string | null;
  endDate: string | null;
  amount: number | null;
  currency: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionResponse {
  subscription: Subscription | null;
  isActive: boolean;
  isTrial: boolean;
  isExpired: boolean;
  isCancelled: boolean;
  message?: string;
}

export interface ValidateLimitResponse {
  valid: boolean;
  limit: number;
  currentCount: number;
  message?: string;
}

/**
 * Get current subscription
 */
export async function getCurrentSubscription(organizationId: string): Promise<SubscriptionResponse> {
  const response = await api.get('/subscriptions/current', {
    headers: {
      'x-organization-id': organizationId,
    },
  });
  return response.data;
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(organizationId: string): Promise<{
  success: boolean;
  subscription: {
    id: string;
    status: string;
    cancelledAt: string;
  };
  message: string;
}> {
  const response = await api.post('/subscriptions/cancel', null, {
    headers: {
      'x-organization-id': organizationId,
    },
  });
  return response.data;
}

/**
 * Validate user limit
 */
export async function validateUserLimit(organizationId: string): Promise<ValidateLimitResponse> {
  const response = await api.get('/subscriptions/validate-limit', {
    headers: {
      'x-organization-id': organizationId,
    },
  });
  return response.data;
}

/**
 * Get payment history
 */
export async function getPaymentHistory(organizationId: string): Promise<{
  payments: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
    createdAt: string;
  }>;
}> {
  const response = await api.get('/subscriptions/payments', {
    headers: {
      'x-organization-id': organizationId,
    },
  });
  return response.data;
}
