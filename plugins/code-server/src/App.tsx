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
import { useCockpitTheme, useCockpitRoute, NavMode } from "@cockpit-plugins/common";

import { CodeServerStatus, CodeServerConfigData } from "./types";
import { codeServerApi, DEFAULT_MOCK_STATUS } from "./api/codeServerClient";
import { HeaderBar } from "./components/HeaderBar";
import { CodeServerIframe } from "./components/CodeServerIframe";
import { InstallPrompt } from "./components/InstallPrompt";
import { SettingsModal } from "./components/SettingsModal";

const IGNORED_PREFIXES = ["code-server", "cockpit-code-server", "vscode", "index"];

const parseRoute = (segments: string[]): string => {
  const clean = segments.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0 || clean[0] === "index" || clean[0] === "main") {
    return "main";
  }
  return clean[0];
};

const formatSegments = (view: string): string[] => {
  if (view === "main") {
    return [];
  }
  return [view];
};

export const App: React.FC = () => {
  useCockpitTheme();

  const [activeView, setActiveView] = useCockpitRoute(parseRoute, formatSegments, IGNORED_PREFIXES);

  const [status, setStatus] = useState<CodeServerStatus>(DEFAULT_MOCK_STATUS);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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

  const loadStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const data = await codeServerApi.getStatus();
      setStatus(data);
    } catch (err: any) {
      addAlert("danger", "Failed to load VS Code Server status", err.message || String(err));
    } finally {
      setIsLoading(false);
      setInitialLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadStatus();

    const handleRefresh = () => {
      loadStatus(true);
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

  const handleSaveConfig = async (newConfig: Partial<CodeServerConfigData>) => {
    setIsLoading(true);
    try {
      const res = await codeServerApi.saveConfig(newConfig);
      if (res.status === "error") {
        addAlert("danger", "Failed to save configuration", res.error);
      } else {
        addAlert("success", "Configuration saved. Restarting service...");
        setIsSettingsOpen(false);
        await codeServerApi.serviceAction("restart");
        await loadStatus(true);
      }
    } catch (err: any) {
      addAlert("danger", "Save config error", err.message || String(err));
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
        await loadStatus();
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

      <HeaderBar
        status={status}
        isLoading={isLoading}
        onRefresh={() => loadStatus()}
        onServiceAction={handleServiceAction}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {status.binary.installed ? (
        <CodeServerIframe
          status={status}
          isLoading={isLoading}
          onStartService={() => handleServiceAction("start")}
        />
      ) : (
        <InstallPrompt isLoading={isLoading} onInstall={handleInstall} />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          config={status.config}
          isLoading={isLoading}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSaveConfig}
        />
      )}
    </Page>
  );
};
