import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
} from "@patternfly/react-core";
import { CommandBox } from "./CommandBox";

interface CommandPreviewModalProps {
  isOpen: boolean;
  title: string;
  command: string[] | string;
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

  if (!isOpen) {
    return null;
  }

  const cmdString = Array.isArray(command) ? command.join(" ") : command;

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onCancel();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      isOpen={isOpen}
      onClose={onCancel}
      appendTo={() => document.body}
    >
      <ModalHeader title={title} />
      <ModalBody>
        {description && (
          <p style={{ marginBottom: "1rem", color: "var(--zfs-text-primary)" }}>{description}</p>
        )}

        {isDestructive && (
          <Alert
            variant="warning"
            isInline
            title="Destructive Operation"
            style={{ marginBottom: "1rem" }}
          >
            This action will permanently alter or erase data. Review the command carefully.
          </Alert>
        )}

        <CommandBox command={cmdString} label="Command line:" />

        {error && (
          <Alert variant="danger" isInline title="Command execution failed" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant={isDestructive ? "danger" : "primary"}
          onClick={handleExecute}
          isLoading={loading}
          isDisabled={loading}
        >
          {isDestructive ? "Execute Destructive Action" : "Run Command"}
        </Button>
        <Button variant="secondary" onClick={onCancel} isDisabled={loading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};
