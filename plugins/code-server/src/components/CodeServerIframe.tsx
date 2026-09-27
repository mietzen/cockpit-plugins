import React, { useState } from "react";
import {
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  Button,
  ClipboardCopy,
} from "@patternfly/react-core";
import { PlayIcon, ExclamationTriangleIcon } from "@patternfly/react-icons";
import { CodeServerStatus } from "../types";

export interface CodeServerIframeProps {
  status: CodeServerStatus;
  isLoading: boolean;
  onStartService: () => void;
}

export const CodeServerIframe: React.FC<CodeServerIframeProps> = ({
  status,
  isLoading,
  onStartService,
}) => {
  const [iframeError, setIframeError] = useState<boolean>(false);
  const isRunning = status.service.active;
  const port = status.config.port || 8080;
  const password = status.config.password;

  const hostName = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const protocol = status.config.cert ? "https:" : "http:";
  const targetUrl = `${protocol}//${hostName}:${port}/`;

  if (!isRunning) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "65vh" }}>
        <EmptyState>
          <EmptyStateHeader
            titleText="VS Code Server is Stopped"
            headingLevel="h2"
            icon={<EmptyStateIcon icon={PlayIcon} />}
          />
          <EmptyStateBody>
            The systemd service <code>{status.service.unit}</code> is currently inactive.
            <br />
            Start the service to load the interactive web IDE inside Cockpit.
          </EmptyStateBody>
          <EmptyStateFooter>
            <Button
              variant="primary"
              icon={<PlayIcon />}
              onClick={onStartService}
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              Start Service
            </Button>
          </EmptyStateFooter>
        </EmptyState>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "calc(100vh - 72px)", display: "flex", flexDirection: "column" }}>
      {password && (
        <div
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "var(--pf-v5-global--BackgroundColor--200, #161b22)",
            borderBottom: "1px solid var(--zfs-card-border, #30363d)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span><strong>Authentication Password:</strong></span>
            <div style={{ width: "240px" }}>
              <ClipboardCopy isReadOnly isCode hoverTip="Copy password" clickTip="Copied">
                {password}
              </ClipboardCopy>
            </div>
          </div>
          <div>
            <span style={{ color: "var(--zfs-text-secondary, #8b949e)" }}>
              If your browser blocks the HTTP iframe on an HTTPS connection, click <strong>Open in New Tab</strong> above.
            </span>
          </div>
        </div>
      )}

      {iframeError ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          <EmptyState>
            <EmptyStateHeader
              titleText="Unable to Embed VS Code in Frame"
              headingLevel="h2"
              icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
            />
            <EmptyStateBody>
              Your browser may have restricted embedding <code>{targetUrl}</code> due to mixed content or security headers.
            </EmptyStateBody>
            <EmptyStateFooter>
              <Button
                variant="primary"
                onClick={() => window.open(targetUrl, "_blank", "noopener,noreferrer")}
              >
                Open in New Tab
              </Button>
            </EmptyStateFooter>
          </EmptyState>
        </div>
      ) : (
        <iframe
          src={targetUrl}
          title="VS Code Server"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            flexGrow: 1,
            backgroundColor: "var(--pf-v5-global--BackgroundColor--100, #0d1117)",
          }}
          onError={() => setIframeError(true)}
        />
      )}
    </div>
  );
};
