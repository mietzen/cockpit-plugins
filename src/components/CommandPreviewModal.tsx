import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Button,
  ClipboardCopy,
  Alert,
  Spinner,
} from "@patternfly/react-core";

interface CommandPreviewModalProps {
  isOpen: boolean;
  title: string;
  command: string[];
  description?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const CommandPreviewModal: React.FC<CommandPreviewModalProps> = ({
  isOpen,
  title,
  command,
  description,
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cmdString = command.join(" ");

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      setLoading(false);
      onCancel();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title={title}
      isOpen={isOpen}
      onClose={onCancel}
      actions={[
        <Button
          key="confirm"
          variant={isDestructive ? "danger" : "primary"}
          onClick={handleConfirm}
          isDisabled={loading}
          isLoading={loading}
        >
          {loading ? "Executing..." : "Execute Command"}
        </Button>,
        <Button key="cancel" variant="link" onClick={onCancel} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      {description && <p style={{ marginBottom: "1rem" }}>{description}</p>}

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.5rem" }}>
          Shell Command Preview:
        </label>
        <ClipboardCopy isReadOnly isCode>
          {cmdString}
        </ClipboardCopy>
      </div>

      {error && (
        <Alert variant="danger" title="Execution Failed" style={{ marginTop: "1rem" }}>
          {error}
        </Alert>
      )}
    </Modal>
  );
};
