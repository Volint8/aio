import api from './api';

export interface InitializePaymentParams {
  plan?: string;
  billingPeriod?: 'monthly' | 'yearly';
  currency?: string;
  userCount?: number;
}

export interface PaystackResponse {
  authorizationUrl: string;
  reference: string;
  accessCode: string;
  amount: number;
  currency: string;
  paymentId: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  payment: {
    id: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
  };
  subscription?: {
    id: string;
    plan: string;
    userCount: number;
    period: string;
    status: string;
  };
}

/**
 * Initialize a payment with Paystack
 */
export async function initializePayment(
  params: InitializePaymentParams,
  organizationId: string
): Promise<PaystackResponse> {
  const response = await api.post('/payments/initialize', params, {
    headers: {
      'x-organization-id': organizationId,
    },
  });
  return response.data;
}

/**
 * Verify a payment by reference
 */
export async function verifyPayment(reference: string): Promise<VerifyPaymentResponse> {
  const response = await api.get(`/payments/verify/${reference}`);
  return response.data;
}

/**
 * Verify a payment by reference (public endpoint)
 */
export async function verifyPaymentPublic(reference: string): Promise<VerifyPaymentResponse> {
  const response = await api.get(`/payments/verify/public/${reference}`);
  return response.data;
}

/**
 * Redirect to Paystack payment page
 */
export function redirectToPaystack(authorizationUrl: string) {
  window.location.href = authorizationUrl;
}
