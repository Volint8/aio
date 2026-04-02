import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { verifyPaymentPublic } from '../services/paymentService';

const PaymentCallback: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('reference');

    if (!ref) {
      setStatus('error');
      setMessage('No payment reference found');
      return;
    }

    setReference(ref);

    const verifyPayment = async () => {
      try {
        const result = await verifyPaymentPublic(ref);
        
        if (result.success) {
          setStatus('success');
          setMessage('Payment successful! Your subscription has been activated.');
          
          // Redirect to subscription page after 3 seconds
          setTimeout(() => {
            navigate('/dashboard?section=subscription');
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Payment verification failed. Please contact support.');
        }
      } catch (err: any) {
        console.error('Payment verification error:', err);
        setStatus('error');
        setMessage(err.response?.data?.error || 'Payment verification failed. Please contact support.');
      }
    };

    verifyPayment();
  }, [location.search, navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#f9fafb',
      padding: '24px',
    }}>
      <div style={{
        background: 'white',
        padding: '48px',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
      }}>
        {status === 'loading' && (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              border: '6px solid #e5e7eb',
              borderTopColor: '#1e40af',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px',
            }} />
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
              Verifying Payment
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280' }}>
              Please wait while we confirm your payment...
            </p>
            {reference && (
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '16px' }}>
                Reference: {reference}
              </p>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#059669"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
              Payment Successful!
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              {message}
            </p>
            <p style={{ fontSize: '13px', color: '#059669', fontWeight: 500 }}>
              Redirecting to subscription page...
            </p>
            <button
              onClick={() => navigate('/dashboard?section=subscription')}
              style={{
                marginTop: '24px',
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
              Go to Subscription
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
              Payment Failed
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
              {message}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => navigate('/dashboard?section=subscription')}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Back to Subscription
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#1e40af',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default PaymentCallback;
