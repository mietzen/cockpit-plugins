import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Button,
  Alert,
} from "@patternfly/react-core";
import { CopyIcon, CheckIcon } from "@patternfly/react-icons";

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
  const [copied, setCopied] = useState(false);

  if (!isOpen) {
    return null;
  }

  const cmdString = Array.isArray(command) ? command.join(" ") : command;

  const handleCopy = () => {
    navigator.clipboard.writeText(cmdString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      title={title}
      isOpen={isOpen}
      onClose={onCancel}
      actions={[
        <Button
          key="confirm"
          variant={isDestructive ? "danger" : "primary"}
          onClick={handleExecute}
          isLoading={loading}
          isDisabled={loading}
        >
          {isDestructive ? "Execute Destructive Action" : "Run Command"}
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onCancel} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      {description && (
        <p style={{ marginBottom: "1rem", color: "#f0f0f0" }}>{description}</p>
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

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.85rem", color: "#a0a0a0", marginBottom: "0.4rem", fontWeight: 600 }}>
          Command line:
        </div>
        <div
          style={{
            position: "relative",
            backgroundColor: "rgb(15, 15, 15)",
            border: "1px solid #383838",
            borderRadius: "8px",
            padding: "10px 42px 10px 14px",
            fontFamily: "monospace",
            fontSize: "0.9rem",
            color: "#92c5f9",
            wordBreak: "break-all",
            lineHeight: "1.4",
          }}
        >
          <span>{cmdString}</span>
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy command"}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              background: "transparent",
              border: "none",
              color: copied ? "#5ba352" : "#a0a0a0",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "color 0.15s ease",
            }}
          >
            {copied ? <CheckIcon style={{ fontSize: "14px" }} /> : <CopyIcon style={{ fontSize: "14px" }} />}
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="danger" isInline title="Command execution failed" style={{ marginTop: "1rem" }}>
          {error}
        </Alert>
      )}
    </Modal>
  );
};
