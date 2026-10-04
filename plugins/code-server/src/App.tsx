import React, { useState, useEffect, useCallback } from "react";
import "@patternfly/react-core/dist/styles/base.css";
import "@cockpit-plugins/common/src/styles/cockpit-theme.css";
import {
  Page,
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  Spinner,
} from "@patternfly/react-core";
import { useCockpitTheme } from "@cockpit-plugins/common";

import { CodeServerStatus } from "./types";
import { codeServerApi, DEFAULT_MOCK_STATUS } from "./api/codeServerClient";
import { CodeServerIframe } from "./components/CodeServerIframe";
import { InstallPrompt } from "./components/InstallPrompt";

export const App: React.FC = () => {
  useCockpitTheme();

  const [status, setStatus] = useState<CodeServerStatus>(DEFAULT_MOCK_STATUS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);

  const [alerts, setAlerts] = useState<
    Array<{ id: string; variant: "success" | "danger" | "warning" | "info"; title: string; message?: string }>
  >([]);

  const addAlert = (
    variant: "success" | "danger" | "warning" | "info",
    title: string,
    message?: string
  ) => {
    const id = `alert-${Date.now()}-${Math.random()}`;
    setAlerts((prev) => [...prev, { id, variant, title, message }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 6000);
  };

  const loadStatus = useCallback(async (isSilent = false, autoStart = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      let data = await codeServerApi.getStatus();
      if (autoStart && data.binary.installed && !data.service.active) {
        await codeServerApi.serviceAction("start");
        data = await codeServerApi.getStatus();
      }
      setStatus(data);
    } catch (err: any) {
      addAlert("danger", "Failed to load VS Code Server status", err.message || String(err));
    } finally {
      setIsLoading(false);
      setInitialLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadStatus(false, true);

    const handleRefresh = () => {
      loadStatus(true, false);
    };

    window.addEventListener("focus", handleRefresh);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadStatus]);

  const handleServiceAction = async (action: "start" | "stop" | "restart") => {
    setIsLoading(true);
    try {
      const res = await codeServerApi.serviceAction(action);
      if (res.status === "error") {
        addAlert("danger", `Failed to ${action} service`, res.error);
      } else {
        addAlert("success", `Service ${action} succeeded`);
        await loadStatus(true);
      }
    } catch (err: any) {
      addAlert("danger", `Service ${action} error`, err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async () => {
    setIsLoading(true);
    try {
      const res = await codeServerApi.install();
      if (res.status === "error") {
        addAlert("danger", "Failed to install code-server", res.error);
      } else {
        addAlert("success", "code-server installed successfully");
        await loadStatus(false, true);
      }
    } catch (err: any) {
      addAlert("danger", "Installation error", err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!initialLoaded && isLoading) {
    return (
      <Page>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <Spinner size="xl" aria-label="Loading VS Code Server plugin" />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <AlertGroup isToast isLiveRegion>
        {alerts.map((a) => (
          <Alert
            key={a.id}
            variant={a.variant}
            title={a.title}
            actionClose={
              <AlertActionCloseButton
                onClose={() => setAlerts((prev) => prev.filter((item) => item.id !== a.id))}
              />
            }
          >
            {a.message}
          </Alert>
        ))}
      </AlertGroup>

      {status.binary.installed ? (
        <CodeServerIframe
          status={status}
          isLoading={isLoading}
          onStartService={() => handleServiceAction("start")}
        />
      ) : (
        <InstallPrompt isLoading={isLoading} onInstall={handleInstall} />
      )}
    </Page>
  );
};
