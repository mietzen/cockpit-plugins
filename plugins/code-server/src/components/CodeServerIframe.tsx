import React, { useState } from "react";
import {
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  Button,
  Tooltip,
} from "@patternfly/react-core";
import { PlayIcon, ExclamationTriangleIcon, ExternalLinkAltIcon } from "@patternfly/react-icons";
import { CodeServerStatus, getCodeServerUrl } from "../types";

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
  const targetUrl = getCodeServerUrl(status.uid);

  if (!isRunning) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
        <EmptyState>
          <EmptyStateHeader
            titleText="Code-Server is Stopped"
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

  const handleOpenStandalone = () => {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: "5px",
          left: "15px",
          zIndex: 1000,
        }}
      >
        <Tooltip content="Open in New Tab">
          <Button
            variant="plain"
            aria-label="Open in New Tab"
            onClick={handleOpenStandalone}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "24px",
              height: "24px",
              padding: "0px",
              borderRadius: "6px",
              backgroundColor: "rgba(20, 20, 25, 0.7)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "rgb(201, 209, 217)",
              boxShadow: "rgba(0, 0, 0, 0.35) 0px 2px 8px",
              cursor: "pointer",
            }}
          >
            <ExternalLinkAltIcon />
          </Button>
        </Tooltip>
      </div>

      {iframeError ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          <EmptyState>
            <EmptyStateHeader
              titleText="Unable to Embed Code-Server in Frame"
              headingLevel="h2"
              icon={<EmptyStateIcon icon={ExclamationTriangleIcon} />}
            />
            <EmptyStateBody>
              Your browser may have restricted embedding <code>{targetUrl}</code> due to mixed content or security headers.
            </EmptyStateBody>
            <EmptyStateFooter>
              <Button
                variant="primary"
                onClick={handleOpenStandalone}
              >
                Open in New Tab
              </Button>
            </EmptyStateFooter>
          </EmptyState>
        </div>
      ) : (
        <iframe
          src={targetUrl}
          title="Code-Server"
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
