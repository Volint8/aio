import axios, { AxiosInstance } from 'axios';

interface InitializePaymentData {
  email: string;
  amount: number;
  metadata?: Record<string, any>;
  callback_url?: string;
}

interface InitializePaymentResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface VerifyPaymentResponse {
  status: boolean;
  message: string;
  data: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel: string;
    paid_at: string;
    metadata?: Record<string, any>;
  };
}

interface CreateCustomerData {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface CreateCustomerResponse {
  status: boolean;
  message: string;
  data: {
    customer_code: string;
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface CreateSubscriptionData {
  customer: string; // customer code
  plan: string; // plan code
  authorization?: string; // authorization code
}

interface CreateSubscriptionResponse {
  status: boolean;
  message: string;
  data: {
    subscription_code: string;
    email_token: string;
    plan: {
      name: string;
      amount: number;
      interval: string;
    };
  };
}

export class PaystackService {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly client: AxiosInstance;

  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    if (!this.secretKey) {
      console.warn('PAYSTACK_SECRET_KEY is not set. Paystack payments will not work.');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Initialize a payment transaction
   */
  async initializePayment(data: InitializePaymentData): Promise<InitializePaymentResponse['data']> {
    try {
      const response = await this.client.post<InitializePaymentResponse>(
        '/transaction/initialize',
        data
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to initialize payment');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Paystack initializePayment error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to initialize payment');
    }
  }

  /**
   * Verify a payment transaction by reference
   */
  async verifyPayment(reference: string): Promise<VerifyPaymentResponse['data']> {
    try {
      const response = await this.client.get<VerifyPaymentResponse>(
        `/transaction/verify/${reference}`
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to verify payment');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Paystack verifyPayment error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to verify payment');
    }
  }

  /**
   * Verify webhook signature using HMAC
   */
  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Parse webhook event from request body
   */
  parseWebhookEvent(body: any): { event: string; data: any; id: string } {
    return {
      event: body.event,
      data: body.data,
      id: body.id || body.event_id,
    };
  }

  /**
   * Create or get a Paystack customer
   */
  async createOrGetCustomer(data: CreateCustomerData): Promise<CreateCustomerResponse['data']> {
    try {
      // First, try to find existing customers with this email
      const listResponse = await this.client.get<{
        status: boolean;
        message: string;
        data: {
          customers: Array<{
            customer_code: string;
            id: number;
            email: string;
            first_name: string;
            last_name: string;
          }>;
        };
      }>('/customer', { params: { perPage: 100, page: 1 } });

      if (listResponse.data.status) {
        const existingCustomer = listResponse.data.data.customers.find(
          (c) => c.email.toLowerCase() === data.email.toLowerCase()
        );

        if (existingCustomer) {
          return existingCustomer;
        }
      }

      // Create new customer
      const response = await this.client.post<CreateCustomerResponse>(
        '/customer',
        data
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to create customer');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Paystack createOrGetCustomer error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create/get customer');
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(data: CreateSubscriptionData): Promise<CreateSubscriptionResponse['data']> {
    try {
      const response = await this.client.post<CreateSubscriptionResponse>(
        '/subscription',
        data
      );

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to create subscription');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Paystack createSubscription error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create subscription');
    }
  }

  /**
   * Disable a subscription
   */
  async disableSubscription(subscriptionCode: string, token: string): Promise<void> {
    try {
      await this.client.post('/subscription/disable', {
        code: subscriptionCode,
        token: token,
      });
    } catch (error: any) {
      console.error('Paystack disableSubscription error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to disable subscription');
    }
  }

  /**
   * Enable a subscription
   */
  async enableSubscription(subscriptionCode: string, token: string): Promise<void> {
    try {
      await this.client.post('/subscription/enable', {
        code: subscriptionCode,
        token: token,
      });
    } catch (error: any) {
      console.error('Paystack enableSubscription error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to enable subscription');
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionIdOrCode: string): Promise<any> {
    try {
      const response = await this.client.get(`/subscription/${subscriptionIdOrCode}`);

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to get subscription');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Paystack getSubscription error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to get subscription');
    }
  }

  /**
   * List subscriptions by customer code
   */
  async listSubscriptionsByCustomer(customerCode: string): Promise<any[]> {
    try {
      const response = await this.client.get<{
        status: boolean;
        message: string;
        data: any[];
      }>('/subscription', {
        params: { customer: customerCode },
      });

      if (!response.data.status) {
        throw new Error(response.data.message || 'Failed to list subscriptions');
      }

      return response.data.data || [];
    } catch (error: any) {
      console.error('Paystack listSubscriptionsByCustomer error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to list subscriptions');
    }
  }
}

export const paystackService = new PaystackService();
