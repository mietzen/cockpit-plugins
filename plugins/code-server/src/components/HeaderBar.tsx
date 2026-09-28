import React from "react";
import {
  Flex,
  FlexItem,
  Button,
  Label,
  Tooltip,
} from "@patternfly/react-core";
import {
  PlayIcon,
  StopIcon,
  SyncAltIcon,
  ExternalLinkAltIcon,
} from "@patternfly/react-icons";
import { CodeServerStatus, getCodeServerUrl } from "../types";

export interface HeaderBarProps {
  status: CodeServerStatus;
  isLoading: boolean;
  onRefresh: () => void;
  onServiceAction: (action: "start" | "stop" | "restart") => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  status,
  isLoading,
  onRefresh,
  onServiceAction,
}) => {
  const isInstalled = status.binary.installed;
  const isRunning = status.service.active;
  const port = status.config.port || 8080;
  const externalUrl = getCodeServerUrl(status.config);

  const handleOpenNewTab = () => {
    window.open(externalUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="cockpit-top-nav-sticky-wrapper">
      <div className="cockpit-top-nav-bar">
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsCenter" }}
          flexWrap={{ default: "wrap" }}
          gap={{ default: "gapMd" }}
        >
          <Flex alignItems={{ default: "alignItemsCenter" }} spaceItems={{ default: "spaceItemsSm" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>VS Code Server</h1>

            <Tooltip content={`Open VS Code Server in new browser tab (${externalUrl})`}>
              <Button
                variant="plain"
                icon={<ExternalLinkAltIcon />}
                onClick={handleOpenNewTab}
                aria-label="Open VS Code in new tab"
                style={{ padding: "0 4px" }}
              />
            </Tooltip>
            
            {isInstalled ? (
              <Label color={isRunning ? "green" : "grey"} isCompact>
                {isRunning ? `Running (Port ${port})` : "Stopped"}
              </Label>
            ) : (
              <Label color="orange" isCompact>
                Not Installed
              </Label>
            )}

            {isInstalled && status.binary.version && (
              <span style={{ fontSize: "0.85rem", color: "var(--pf-v5-global--Color--200, #8b949e)" }}>
                v{status.binary.version}
              </span>
            )}
          </Flex>

          <Flex alignItems={{ default: "alignItemsCenter" }} spaceItems={{ default: "spaceItemsSm" }}>
            {isInstalled && (
              <>
                {isRunning ? (
                  <>
                    <Tooltip content="Open VS Code in standalone browser tab">
                      <Button
                        variant="primary"
                        icon={<ExternalLinkAltIcon />}
                        onClick={handleOpenNewTab}
                        aria-label="Open in new tab"
                      >
                        Open in New Tab
                      </Button>
                    </Tooltip>

                    <Button
                      variant="secondary"
                      icon={<SyncAltIcon className={isLoading ? "pf-m-spin" : ""} />}
                      onClick={() => onServiceAction("restart")}
                      isDisabled={isLoading}
                      aria-label="Restart service"
                    >
                      Restart
                    </Button>

                    <Button
                      variant="danger"
                      icon={<StopIcon />}
                      onClick={() => onServiceAction("stop")}
                      isDisabled={isLoading}
                      aria-label="Stop service"
                    >
                      Stop
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    icon={<PlayIcon />}
                    onClick={() => onServiceAction("start")}
                    isDisabled={isLoading}
                    aria-label="Start service"
                  >
                    Start Service
                  </Button>
                )}
              </>
            )}

            <Button
              variant="plain"
              icon={<SyncAltIcon className={isLoading ? "pf-m-spin" : ""} />}
              onClick={onRefresh}
              isDisabled={isLoading}
              aria-label="Refresh status"
            />
          </Flex>
        </Flex>
      </div>
    </div>
  );
};
