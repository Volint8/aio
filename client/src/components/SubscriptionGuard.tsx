import React from 'react';

interface SubscriptionGuardProps {
  isActive: boolean;
  isTrial: boolean;
  children: React.ReactNode;
  disabledMessage?: string;
}

/**
 * Wrapper component that disables children when subscription is not active
 */
export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  isActive,
  isTrial,
  children,
  disabledMessage,
}) => {
  const isDisabled = !isActive && !isTrial;

  if (!isDisabled) {
    return <>{children}</>;
  }

  return (
    <div style={{ position: 'relative', opacity: 0.5, pointerEvents: 'none' }}>
      {children}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        textAlign: 'center',
        zIndex: 100,
        minWidth: '300px',
      }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: '16px' }}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
          Feature Locked
        </div>
        <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
          {disabledMessage || 'Upgrade your subscription to access this feature'}
        </div>
      </div>
    </div>
  );
};

interface SubscriptionButtonProps {
  isActive: boolean;
  isTrial: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabledMessage?: string;
  className?: string;
}

/**
 * Button variant that shows overlay when subscription is not active
 */
export const SubscriptionButton: React.FC<SubscriptionButtonProps> = ({
  isActive,
  isTrial,
  onClick,
  children,
  disabledMessage,
  className,
}) => {
  const isDisabled = !isActive && !isTrial;

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      className={className}
      disabled={isDisabled}
      style={{
        position: 'relative',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      {children}
      {isDisabled && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.95)',
          padding: '8px 12px',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          textAlign: 'center',
          zIndex: 100,
          whiteSpace: 'nowrap',
          fontSize: '12px',
          fontWeight: 500,
          color: '#dc2626',
        }}>
          {disabledMessage || 'Upgrade required'}
        </div>
      )}
    </button>
  );
};

interface SubscriptionOverlayProps {
  isActive: boolean;
  isTrial: boolean;
  onUpgrade: () => void;
  message?: string;
}

/**
 * Full overlay component to block access when subscription is not active
 */
export const SubscriptionOverlay: React.FC<SubscriptionOverlayProps> = ({
  isActive,
  isTrial,
  onUpgrade,
  message,
}) => {
  const isDisabled = !isActive && !isTrial;

  if (!isDisabled) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '16px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%',
      }}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginBottom: '24px' }}
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>
          Subscription Required
        </h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
          {message || 'Your subscription has expired. Please upgrade to continue accessing this feature.'}
        </p>
        <button
          onClick={onUpgrade}
          style={{
            padding: '12px 32px',
            borderRadius: '8px',
            border: 'none',
            background: '#1e40af',
            color: 'white',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Upgrade Now
        </button>
      </div>
    </div>
  );
};

export default SubscriptionGuard;
