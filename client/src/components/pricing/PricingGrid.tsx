import React, { useState } from 'react';

export interface TierOption {
  id: string;
  users: number;
  label: string;
  prices: {
    NGN: {
      monthly: number;
      yearly: number;
    };
  };
}

const tierOptions: TierOption[] = [
  { id: 'tier-free', users: 10, label: '10 users', prices: { NGN: { monthly: 0, yearly: 0 } } },
  { id: 'tier-100', users: 100, label: '100 users', prices: { NGN: { monthly: 10000, yearly: 120000 } } },
  { id: 'tier-250', users: 250, label: '250 users', prices: { NGN: { monthly: 25000, yearly: 300000 } } },
  { id: 'tier-500', users: 500, label: '500 users', prices: { NGN: { monthly: 55000, yearly: 660000 } } },
  { id: 'tier-1000', users: 1000, label: '1000 users', prices: { NGN: { monthly: 110000, yearly: 1320000 } } },
];

interface PricingGridProps {
  selectedTier: TierOption;
  billingPeriod: 'monthly' | 'yearly';
  onTierChange: (tier: TierOption) => void;
  onPeriodChange: (period: 'monthly' | 'yearly') => void;
  currentPlan?: number; // Current user count from subscription
  disabled?: boolean;
}

const formatPrice = (price: number): string => {
  if (price === 0) return 'Free';
  return `₦${price.toLocaleString('en-NG')}`;
};

const PricingGrid: React.FC<PricingGridProps> = ({
  selectedTier,
  billingPeriod,
  onTierChange,
  onPeriodChange,
  currentPlan,
  disabled = false,
}) => {
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);

  const handleTierSelect = (tier: TierOption) => {
    if (!disabled && tier.users > 10) {
      onTierChange(tier);
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Billing Period Toggle */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '12px',
        marginBottom: '32px'
      }}>
        <span style={{ 
          fontWeight: billingPeriod === 'monthly' ? 600 : 400,
          color: billingPeriod === 'monthly' ? '#1e40af' : '#6b7280',
          cursor: 'pointer',
        }} onClick={() => onPeriodChange('monthly')}>
          Monthly
        </span>
        <button
          onClick={() => onPeriodChange(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
          style={{
            position: 'relative',
            width: '56px',
            height: '28px',
            borderRadius: '14px',
            background: billingPeriod === 'yearly' ? '#1e40af' : '#e5e7eb',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          aria-label="Toggle billing period"
        >
          <span
            style={{
              position: 'absolute',
              top: '4px',
              left: billingPeriod === 'yearly' ? '32px' : '4px',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'left 0.2s',
            }}
          />
        </button>
        <span style={{ 
          fontWeight: billingPeriod === 'yearly' ? 600 : 400,
          color: billingPeriod === 'yearly' ? '#1e40af' : '#6b7280',
          cursor: 'pointer',
        }} onClick={() => onPeriodChange('yearly')}>
          Yearly
          <span style={{ 
            marginLeft: '6px', 
            fontSize: '12px', 
            color: '#059669',
            fontWeight: 500,
          }}>Save 17%</span>
        </span>
      </div>

      {/* Tier Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        maxWidth: '1000px',
        margin: '0 auto',
      }}>
        {tierOptions.map((tier) => {
          const isSelected = selectedTier.id === tier.id;
          const isCurrentPlan = currentPlan === tier.users;
          const isFree = tier.users === 10;
          const price = tier.prices.NGN[billingPeriod];

          return (
            <div
              key={tier.id}
              onMouseEnter={() => setHoveredTier(tier.id)}
              onMouseLeave={() => setHoveredTier(null)}
              onClick={() => handleTierSelect(tier)}
              style={{
                padding: '24px',
                borderRadius: '12px',
                border: isSelected ? '2px solid #1e40af' : '1px solid #e5e7eb',
                background: isSelected ? '#eff6ff' : 'white',
                cursor: isFree || disabled ? 'default' : 'pointer',
                transition: 'all 0.2s',
                transform: hoveredTier === tier.id && !disabled && !isFree ? 'translateY(-4px)' : 'none',
                boxShadow: hoveredTier === tier.id && !disabled && !isFree 
                  ? '0 8px 16px rgba(0,0,0,0.1)' 
                  : '0 1px 3px rgba(0,0,0,0.1)',
                opacity: disabled && !isFree && !isSelected ? 0.5 : 1,
                position: 'relative',
              }}
            >
              {/* Current Plan Badge */}
              {isCurrentPlan && (
                <span style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#059669',
                  background: '#d1fae5',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}>
                  Current
                </span>
              )}

              {/* Tier Name */}
              <h3 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                marginBottom: '8px',
              }}>
                {tier.label}
              </h3>

              {/* Price */}
              <div style={{
                fontSize: '32px',
                fontWeight: 700,
                color: isSelected ? '#1e40af' : '#111827',
                marginBottom: '4px',
              }}>
                {formatPrice(price)}
              </div>

              {/* Period */}
              {price > 0 && (
                <div style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  marginBottom: '16px',
                }}>
                  per {billingPeriod}
                </div>
              )}

              {/* Features */}
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '16px 0',
                fontSize: '14px',
                color: '#4b5563',
              }}>
                <li style={{ marginBottom: '8px' }}>✓ Up to {tier.users} members</li>
                {tier.users > 10 && (
                  <>
                    <li style={{ marginBottom: '8px' }}>✓ All features included</li>
                    <li style={{ marginBottom: '8px' }}>✓ Priority support</li>
                  </>
                )}
                {tier.users === 10 && (
                  <>
                    <li style={{ marginBottom: '8px' }}>✓ Basic features</li>
                    <li style={{ marginBottom: '8px' }}>✓ Community support</li>
                  </>
                )}
              </ul>

              {/* Select Button */}
              {isFree ? (
                <div style={{
                  padding: '12px',
                  textAlign: 'center',
                  borderRadius: '8px',
                  background: '#f3f4f6',
                  color: '#6b7280',
                  fontWeight: 500,
                  fontSize: '14px',
                }}>
                  Free Forever
                </div>
              ) : (
                <div style={{
                  padding: '12px',
                  textAlign: 'center',
                  borderRadius: '8px',
                  background: isSelected ? '#1e40af' : '#eff6ff',
                  color: isSelected ? 'white' : '#1e40af',
                  fontWeight: 600,
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}>
                  {isSelected ? 'Selected' : isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingGrid;
