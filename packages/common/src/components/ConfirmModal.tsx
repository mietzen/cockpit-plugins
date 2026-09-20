import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Alert,
  TextInput,
  FormGroup,
} from '@patternfly/react-core';

export type ConfirmVariant = 'danger' | 'primary' | 'warning';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: ConfirmVariant;
  requireConfirmString?: string;
  confirmInputPlaceholder?: string;
  isLoading?: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  requireConfirmString,
  confirmInputPlaceholder,
  isLoading = false,
  error = null,
  onConfirm,
  onCancel,
}) => {
  const [typedString, setTypedString] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTypedString('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const isConfirmed = !requireConfirmString || typedString.trim() === requireConfirmString.trim();

  const handleConfirm = () => {
    if (isConfirmed && !isLoading) {
      onConfirm();
    }
  };

  const buttonVariant = confirmVariant === 'danger' ? 'danger' : 'primary';

  return (
    <Modal
      variant={ModalVariant.small}
      title={title}
      titleIconVariant={confirmVariant === 'danger' ? 'danger' : confirmVariant === 'warning' ? 'warning' : undefined}
      isOpen={isOpen}
      onClose={onCancel}
      appendTo={() => document.body}
      actions={[
        <Button
          key="confirm"
          variant={buttonVariant}
          isLoading={isLoading}
          isDisabled={!isConfirmed || isLoading}
          onClick={handleConfirm}
        >
          {confirmText}
        </Button>,
        <Button
          key="cancel"
          variant="link"
          isDisabled={isLoading}
          onClick={onCancel}
        >
          {cancelText}
        </Button>,
      ]}
    >
      {error && (
        <Alert
          variant="danger"
          isInline
          title="Error"
          style={{ marginBottom: '1rem' }}
        >
          {error}
        </Alert>
      )}

      <div style={{ marginBottom: requireConfirmString ? '1rem' : 0 }}>
        {message}
      </div>

      {requireConfirmString && (
        <FormGroup
          label={
            <span>
              Type <strong>{requireConfirmString}</strong> to confirm:
            </span>
          }
          fieldId="confirm-string-input"
        >
          <TextInput
            id="confirm-string-input"
            value={typedString}
            onChange={(_event, val) => setTypedString(val)}
            placeholder={confirmInputPlaceholder || requireConfirmString}
            isDisabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isConfirmed && !isLoading) {
                handleConfirm();
              }
            }}
          />
        </FormGroup>
      )}
    </Modal>
  );
};
