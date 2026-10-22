import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 py-1">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-copper-100 text-copper-700'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{message}</p>
        </div>
      </div>
    </Modal>
  );
};
