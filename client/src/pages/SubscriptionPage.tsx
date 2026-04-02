import React, { useEffect, useState } from 'react';
import { getCurrentSubscription, cancelSubscription, type Subscription } from '../services/subscriptionService';
import PricingGrid, { type TierOption } from '../components/pricing/PricingGrid';
import { initializePayment, redirectToPaystack } from '../services/paymentService';

interface SubscriptionPageProps {
  organizationId: string;
}

const SubscriptionPage: React.FC<SubscriptionPageProps> = ({ organizationId }) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Pricing state
  const [selectedTier, setSelectedTier] = useState<TierOption>({
    id: 'tier-100',
    users: 100,
    label: '100 users',
    prices: { NGN: { monthly: 10000, yearly: 120000 } },
  });
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const loadSubscription = async () => {
    try {
      setLoading(true);
      const data = await getCurrentSubscription(organizationId);
      setSubscription(data.subscription);
      setIsActive(data.isActive);
      setIsTrial(data.isTrial);
      setIsCancelled(data.isCancelled);

      // Pre-select current tier if exists
      if (data.subscription?.userCount) {
        const tierOptions = [
          { id: 'tier-10', users: 10, label: '10 users', prices: { NGN: { monthly: 0, yearly: 0 } } },
          { id: 'tier-100', users: 100, label: '100 users', prices: { NGN: { monthly: 10000, yearly: 120000 } } },
          { id: 'tier-250', users: 250, label: '250 users', prices: { NGN: { monthly: 25000, yearly: 300000 } } },
          { id: 'tier-500', users: 500, label: '500 users', prices: { NGN: { monthly: 55000, yearly: 660000 } } },
          { id: 'tier-1000', users: 1000, label: '1000 users', prices: { NGN: { monthly: 110000, yearly: 1320000 } } },
        ];
        const currentTier = tierOptions.find(t => t.users === data.subscription?.userCount);
        if (currentTier) {
          setSelectedTier(currentTier);
        }
      }
    } catch (err: any) {
      setError('Failed to load subscription');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, [organizationId]);

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return;
    }

    try {
      setCancelling(true);
      await cancelSubscription(organizationId);
      setSuccessMessage('Subscription cancelled successfully. You will have access until the end of your billing period.');
      loadSubscription();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  };

  const handleUpgradeClick = () => {
    if (selectedTier.users <= 10) {
      return;
    }

    setError('');

    initializePayment(
      {
        plan: 'standard',
        billingPeriod,
        currency: 'NGN',
        userCount: selectedTier.users,
      },
      organizationId
    )
      .then((response) => {
        redirectToPaystack(response.authorizationUrl);
      })
      .catch((err: any) => {
        setError(err.response?.data?.error || 'Failed to initialize payment');
      });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = () => {
    if (isTrial) {
      return (
        <span style={{
          padding: '6px 12px',
          borderRadius: '12px',
          background: '#fef3c7',
          color: '#92400e',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          Trial
        </span>
      );
    }
    if (isActive) {
      return (
        <span style={{
          padding: '6px 12px',
          borderRadius: '12px',
          background: '#d1fae5',
          color: '#065f46',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          Active
        </span>
      );
    }
    if (isCancelled) {
      return (
        <span style={{
          padding: '6px 12px',
          borderRadius: '12px',
          background: '#fee2e2',
          color: '#991b1b',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          Cancelled
        </span>
      );
    }
    return (
      <span style={{
        padding: '6px 12px',
        borderRadius: '12px',
        background: '#f3f4f6',
        color: '#374151',
        fontSize: '12px',
        fontWeight: 600,
      }}>
        No Subscription
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#1e40af',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px',
          }} />
          <div style={{ color: '#6b7280' }}>Loading subscription...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
          Subscription
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Manage your organization's subscription and billing
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#fef2f2',
          color: '#dc2626',
          marginBottom: '24px',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{
          padding: '16px',
          borderRadius: '8px',
          background: '#d1fae5',
          color: '#065f46',
          marginBottom: '24px',
          fontSize: '14px',
        }}>
          {successMessage}
        </div>
      )}

      {/* Current Subscription Card */}
      <div style={{
        padding: '24px',
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827' }}>
            Current Subscription
          </h2>
          {getStatusBadge()}
        </div>

        {subscription ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Plan</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>
                {subscription.plan}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Members Limit</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                {subscription.userCount} members
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Billing Period</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>
                {subscription.period}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Amount</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                {subscription.amount ? `₦${(subscription.amount / 100).toLocaleString('en-NG')}` : 'Free'}
              </div>
            </div>
            {subscription.trialEndDate && (
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Trial Ends</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#92400e' }}>
                  {formatDate(subscription.trialEndDate)}
                </div>
              </div>
            )}
            {subscription.startDate && (
              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Started</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
                  {formatDate(subscription.startDate)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9ca3af"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: '0 auto 16px' }}
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
              No Active Subscription
            </div>
            <div style={{ fontSize: '14px' }}>
              You're on the free tier with up to 10 members. Upgrade to add more members.
            </div>
          </div>
        )}

        {/* Cancel Button */}
        {(isActive || isTrial) && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
            <button
              onClick={handleCancelSubscription}
              disabled={cancelling}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #dc2626',
                background: 'white',
                color: '#dc2626',
                fontSize: '14px',
                fontWeight: 500,
                cursor: cancelling ? 'not-allowed' : 'pointer',
                opacity: cancelling ? 0.5 : 1,
              }}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
            </button>
          </div>
        )}
      </div>

      {/* Upgrade Section */}
      {!isActive && !isTrial && (
        <div style={{
          padding: '24px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
            Upgrade Your Plan
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
            Choose a plan that fits your organization's needs
          </p>

          <PricingGrid
            selectedTier={selectedTier}
            billingPeriod={billingPeriod}
            onTierChange={setSelectedTier}
            onPeriodChange={setBillingPeriod}
            disabled={false}
          />

          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <button
              onClick={handleUpgradeClick}
              disabled={selectedTier.users === 10}
              style={{
                padding: '14px 48px',
                borderRadius: '8px',
                border: 'none',
                background: selectedTier.users === 10 ? '#9ca3af' : '#1e40af',
                color: 'white',
                fontSize: '16px',
                fontWeight: 600,
                cursor: selectedTier.users === 10 ? 'not-allowed' : 'pointer',
              }}
            >
              {selectedTier.users === 10 ? 'Select a Paid Plan' : 'Continue to Payment'}
            </button>
          </div>
        </div>
      )}

      {/* Change Plan Section (for active subscriptions) */}
      {isActive && (
        <div style={{
          padding: '24px',
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          marginBottom: '32px',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
            Change Plan
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
            Upgrade to a higher tier or change your billing period
          </p>

          <PricingGrid
            selectedTier={selectedTier}
            billingPeriod={billingPeriod}
            onTierChange={setSelectedTier}
            onPeriodChange={setBillingPeriod}
            currentPlan={subscription?.userCount}
            disabled={false}
          />

          <div style={{ textAlign: 'center', marginTop: '32px' }}>
            <button
              onClick={handleUpgradeClick}
              disabled={selectedTier.users === subscription?.userCount && billingPeriod === subscription?.period}
              style={{
                padding: '14px 48px',
                borderRadius: '8px',
                border: 'none',
                background: selectedTier.users === subscription?.userCount && billingPeriod === subscription?.period
                  ? '#9ca3af'
                  : '#1e40af',
                color: 'white',
                fontSize: '16px',
                fontWeight: 600,
                cursor: selectedTier.users === subscription?.userCount && billingPeriod === subscription?.period
                  ? 'not-allowed'
                  : 'pointer',
              }}
            >
              {selectedTier.users === subscription?.userCount && billingPeriod === subscription?.period
                ? 'Current Plan'
                : 'Change Plan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPage;
