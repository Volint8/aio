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
    <div className="modal-overlay error-dialog-overlay" onClick={onClose}>
      <div 
        className="modal error-dialog" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="error-dialog-header">
          <div className="error-dialog-mark">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <h2>{title}</h2>
        </div>
        
        <div className="error-dialog-body">
          <p>{message}</p>
        </div>
        
        <div className="error-dialog-actions">
          <button
            onClick={onClose}
            className="btn-vermilion"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDialog;
