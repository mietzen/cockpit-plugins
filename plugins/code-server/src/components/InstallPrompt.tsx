import React from "react";
import {
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  Button,
} from "@patternfly/react-core";
import { CodeBranchIcon, DownloadIcon } from "@patternfly/react-icons";

export interface InstallPromptProps {
  isLoading: boolean;
  onInstall: () => void;
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({ isLoading, onInstall }) => {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "65vh" }}>
      <EmptyState>
        <EmptyStateHeader
          titleText="VS Code Server Not Found"
          headingLevel="h2"
          icon={<EmptyStateIcon icon={CodeBranchIcon} />}
        />
        <EmptyStateBody>
          <code>code-server</code> is not installed or not found in the system <code>PATH</code>.
          <br />
          You can install it automatically or execute the command below in the terminal.
          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem 1rem",
              backgroundColor: "var(--pf-v5-global--BackgroundColor--200, #161b22)",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "0.85rem",
              textAlign: "left",
              lineHeight: "1.5",
            }}
          >
            # Debian / Ubuntu
            <br />
            sudo apt install cockpit-code-server
            <br />
            sudo systemctl enable --now code-server@$USER
            <br />
            <br />
            # Fedora / RHEL
            <br />
            sudo dnf install cockpit-code-server
            <br />
            sudo systemctl enable --now code-server@$USER
          </div>
        </EmptyStateBody>
        <EmptyStateFooter>
          <Button
            variant="primary"
            icon={<DownloadIcon />}
            onClick={onInstall}
            isLoading={isLoading}
            isDisabled={isLoading}
          >
            Install code-server
          </Button>
        </EmptyStateFooter>
      </EmptyState>
    </div>
  );
};
