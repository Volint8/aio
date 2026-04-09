import React from 'react';
import '../styles/Dashboard.css';

interface ErrorDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

const ErrorDialog: React.FC<ErrorDialogProps> = ({
  isOpen,
  title = 'Error',
  message,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal error-dialog" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '420px',
          padding: 0,
          overflow: 'hidden'
        }}
      >
        <div style={{
          background: '#fef2f2',
          padding: '24px 24px 16px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h2 style={{
            margin: '0 0 8px',
            fontSize: '1.25em',
            fontWeight: 700,
            color: '#991b1b'
          }}>
            {title}
          </h2>
        </div>
        
        <div style={{
          padding: '20px 24px',
          textAlign: 'center'
        }}>
          <p style={{
            margin: 0,
            fontSize: '0.95em',
            color: '#64748b',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap'
          }}>
            {message}
          </p>
        </div>
        
        <div style={{
          padding: '16px 24px 24px',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{
              minWidth: '120px',
              padding: '10px 24px',
              background: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.95em',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = '#dc2626';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = '#ef4444';
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDialog;
