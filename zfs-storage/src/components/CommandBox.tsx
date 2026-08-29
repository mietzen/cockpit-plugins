import React, { useState } from "react";
import { CopyIcon, CheckIcon } from "@patternfly/react-icons";

interface CommandBoxProps {
  command: string | string[];
  label?: string;
}

export const CommandBox: React.FC<CommandBoxProps> = ({
  command,
  label = "Shell Command Preview:",
}) => {
  const [copied, setCopied] = useState(false);
  const cmdString = Array.isArray(command) ? command.join(" ") : command;

  const handleCopy = () => {
    navigator.clipboard.writeText(cmdString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
      {label && (
        <div style={{ fontSize: "0.85rem", color: "var(--zfs-text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>
          {label}
        </div>
      )}
      <div
        style={{
          position: "relative",
          backgroundColor: "var(--zfs-code-bg)",
          border: "1px solid var(--zfs-card-border)",
          borderRadius: "8px",
          padding: "10px 42px 10px 14px",
          fontFamily: "monospace",
          fontSize: "0.85rem",
          color: "var(--zfs-code-color)",
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
            color: copied ? "#5ba352" : "var(--zfs-text-secondary)",
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
  );
};
