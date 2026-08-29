import React, { useEffect, useState, useCallback } from "react";
import "@patternfly/react-core/dist/styles/base.css";
import "./styles/cockpit-theme.css";
import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Page,
  PageSection,
  Spinner,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { fileSharingApi } from "./api/fileSharingClient";
import { FileSharingOverview, SmbShare } from "./types";
import { Navigation } from "./components/Navigation";
import { DashboardView } from "./components/DashboardView";
import { SmbSharesTab } from "./components/SmbSharesTab";
import { NfsExportsTab } from "./components/NfsExportsTab";
import { UsersTab } from "./components/UsersTab";
import { SessionsTab } from "./components/SessionsTab";
import { SettingsView } from "./components/SettingsView";

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>("dashboard");
  const [data, setData] = useState<FileSharingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alerts, setAlerts] = useState<Array<{ key: number; title: string; variant: "success" | "danger" | "warning" }>>([]);

  // Ansible marker preferences
  const [ansibleBegin, setAnsibleBegin] = useState("# <-- BEGIN ANSIBLE MANAGED * CONFIG -->");
  const [ansibleEnd, setAnsibleEnd] = useState("# <-- END ANSIBLE MANAGED * CONFIG -->");

  const addAlert = (title: string, variant: "success" | "danger" | "warning" = "success") => {
    setAlerts((prev) => [...prev, { key: Date.now(), title, variant }]);
  };

  const removeAlert = (key: number) => {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const overview = await fileSharingApi.getOverview(ansibleBegin, ansibleEnd);
      setData(overview);
    } catch (err: any) {
      addAlert(err.message || "Failed to load file sharing data", "danger");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ansibleBegin, ansibleEnd]);

  // Sync theme with Cockpit shell
  useEffect(() => {
    const applyTheme = (forcedTheme?: any) => {
      let shellStyle = forcedTheme;
      if (typeof shellStyle !== "string") {
        try {
          shellStyle = localStorage.getItem("shell:style") || localStorage.getItem("cockpit_filesharing_theme") || localStorage.getItem("cockpit_zfs_theme");
        } catch (e) {}
      }
      if (!shellStyle) {
        shellStyle = "auto";
      }

      let isDark = false;
      let isExplicitLight = false;

      if (shellStyle === "dark") {
        isDark = true;
      } else if (shellStyle === "light") {
        isExplicitLight = true;
      } else {
        // "auto" mode: check parent frame class list first, then OS prefers-color-scheme
        try {
          if (window.parent && window.parent !== window && window.parent.document && window.parent.document.documentElement) {
            const pCls = window.parent.document.documentElement.classList;
            if (pCls.contains("pf-v6-theme-dark") || pCls.contains("pf-v5-theme-dark") || pCls.contains("theme-dark")) {
              isDark = true;
            }
          }
        } catch (e) {}

        if (!isDark && window.matchMedia) {
          try {
            if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
              isDark = true;
            }
          } catch (e) {}
        }
      }

      const docEl = document.documentElement;
      if (isDark) {
        docEl.classList.add("pf-v5-theme-dark");
        docEl.classList.add("pf-v6-theme-dark");
        docEl.classList.remove("theme-light");
        docEl.classList.remove("pf-m-light");
      } else if (isExplicitLight) {
        docEl.classList.remove("pf-v5-theme-dark");
        docEl.classList.remove("pf-v6-theme-dark");
        docEl.classList.add("theme-light");
        docEl.classList.add("pf-m-light");
      } else {
        docEl.classList.remove("pf-v5-theme-dark");
        docEl.classList.remove("pf-v6-theme-dark");
        docEl.classList.remove("theme-light");
        docEl.classList.remove("pf-m-light");
      }
    };

    applyTheme();

    const handleCockpitStyle = (e: any) => {
      applyTheme(e.detail?.style || e.detail?.theme);
    };

    window.addEventListener("cockpit-style", handleCockpitStyle);
    window.addEventListener("storage", applyTheme);

    if (window.matchMedia) {
      try {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener("change", applyTheme);
        } else if ((mediaQuery as any).addListener) {
          (mediaQuery as any).addListener(applyTheme);
        }
      } catch (e) {}
    }

    // Observe parent frame class changes in real time
    let observer: MutationObserver | null = null;
    try {
      if (window.parent && window.parent !== window && window.parent.document && window.parent.document.documentElement) {
        observer = new MutationObserver(() => applyTheme());
        observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ["class"] });
      }
    } catch (e) {}

    const intervalId = setInterval(applyTheme, 1000);

    return () => {
      window.removeEventListener("cockpit-style", handleCockpitStyle);
      window.removeEventListener("storage", applyTheme);
      clearInterval(intervalId);
      if (observer) observer.disconnect();
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSmbShare = async (share: Partial<SmbShare>) => {
    await fileSharingApi.saveSmbShare(share);
    addAlert(`Samba share [${share.name}] saved successfully`);
    await loadData(true);
  };

  const handleDeleteSmbShare = async (name: string) => {
    await fileSharingApi.deleteSmbShare(name);
    addAlert(`Samba share [${name}] deleted`);
    await loadData(true);
  };

  const handleSaveSmbGlobal = async (globalData: Record<string, string>) => {
    await fileSharingApi.saveSmbGlobal(globalData);
    addAlert("Samba global settings updated");
    await loadData(true);
  };

  const handleSaveNfsExport = async (exportData: { path: string; clients: any[] }) => {
    await fileSharingApi.saveNfsExport(exportData);
    addAlert(`NFS export for ${exportData.path} saved`);
    await loadData(true);
  };

  const handleDeleteNfsExport = async (path: string) => {
    await fileSharingApi.deleteNfsExport(path);
    addAlert(`NFS export for ${path} deleted`);
    await loadData(true);
  };

  const handleCreateUser = async (username: string, pass: string) => {
    await fileSharingApi.createSmbUser(username, pass);
    addAlert(`Samba user [${username}] created`);
    await loadData(true);
  };

  const handleSetUserPassword = async (username: string, pass: string) => {
    await fileSharingApi.setSmbUserPassword(username, pass);
    addAlert(`Password updated for [${username}]`);
    await loadData(true);
  };

  const handleSetUserState = async (username: string, enable: boolean) => {
    await fileSharingApi.setSmbUserState(username, enable);
    addAlert(`User [${username}] ${enable ? "enabled" : "disabled"}`);
    await loadData(true);
  };

  const handleDeleteUser = async (username: string) => {
    await fileSharingApi.deleteSmbUser(username);
    addAlert(`Samba user [${username}] removed`);
    await loadData(true);
  };

  const handleServiceAction = async (service: string, verb: "restart" | "reload") => {
    await fileSharingApi.serviceAction(service, verb);
    addAlert(`Service [${service}] ${verb}ed`);
    await loadData(true);
  };

  const handleSaveAnsibleMarkers = (begin: string, end: string) => {
    setAnsibleBegin(begin);
    setAnsibleEnd(end);
    addAlert("Ansible marker patterns updated");
  };

  if (loading && !data) {
    return (
      <Page>
        <PageSection style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
          <Flex direction={{ default: "column" }} alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>
              <Spinner size="xl" aria-label="Loading file sharing configuration" />
            </FlexItem>
            <FlexItem style={{ marginTop: "1rem", color: "var(--zfs-text-secondary)" }}>
              Loading file sharing overview...
            </FlexItem>
          </Flex>
        </PageSection>
      </Page>
    );
  }

  const overview = data || {
    services: {
      smbd: { unit: "smbd", active: false, state: "inactive", enabled: false, installed: false },
      nmbd: { unit: "nmbd", active: false, state: "inactive", enabled: false, installed: false },
      nfs: { unit: "nfs-server", active: false, state: "inactive", enabled: false, installed: false },
    },
    smb: {
      global: { workgroup: "WORKGROUP", server_string: "Samba Server" },
      shares: [],
      ansible_markers: { begin: ansibleBegin, end: ansibleEnd },
    },
    nfs: { exports: [], client_map: [] },
    users: { smb_users: [], unixUsers: [], access_matrix: [] },
    sessions: [],
    zfs_mounts: [],
  };

  return (
    <Page>
      <AlertGroup isToast isLiveRegion>
        {alerts.map((alert) => (
          <Alert
            key={alert.key}
            variant={alert.variant}
            title={alert.title}
            actionClose={<AlertActionCloseButton onClose={() => removeAlert(alert.key)} />}
            timeout={5000}
          />
        ))}
      </AlertGroup>

      <Navigation
        activeView={activeView}
        onSelectView={(view) => setActiveView(view)}
        onRefresh={() => loadData(false)}
        isLoading={refreshing}
      />

      <div style={{ display: activeView === "dashboard" ? "block" : "none" }}>
        <DashboardView
          overview={overview}
          onNavigate={(view) => setActiveView(view)}
          onCreateSmbShare={() => setActiveView("smb")}
          onCreateNfsExport={() => setActiveView("nfs")}
          onAddUser={() => setActiveView("users")}
        />
      </div>

      <div style={{ display: activeView === "smb" ? "block" : "none" }}>
        <SmbSharesTab
          shares={overview.smb.shares}
          zfsMounts={overview.zfs_mounts}
          onSaveShare={handleSaveSmbShare}
          onDeleteShare={handleDeleteSmbShare}
        />
      </div>

      <div style={{ display: activeView === "nfs" ? "block" : "none" }}>
        <NfsExportsTab
          exports={overview.nfs.exports}
          clientMap={overview.nfs.client_map}
          zfsMounts={overview.zfs_mounts}
          onSaveExport={handleSaveNfsExport}
          onDeleteExport={handleDeleteNfsExport}
        />
      </div>

      <div style={{ display: activeView === "users" ? "block" : "none" }}>
        <UsersTab
          users={overview.users.smb_users}
          unixUsers={overview.users.unix_users}
          accessMatrix={overview.users.access_matrix}
          onCreateUser={handleCreateUser}
          onSetPassword={handleSetUserPassword}
          onSetState={handleSetUserState}
          onDeleteUser={handleDeleteUser}
        />
      </div>

      <div style={{ display: activeView === "sessions" ? "block" : "none" }}>
        <SessionsTab
          services={overview.services}
          sessions={overview.sessions}
          onServiceAction={handleServiceAction}
          onRefresh={() => loadData(false)}
        />
      </div>

      <div style={{ display: activeView === "settings" ? "block" : "none" }}>
        <SettingsView
          globalSettings={overview.smb.global}
          ansibleBegin={ansibleBegin}
          ansibleEnd={ansibleEnd}
          onSaveGlobal={handleSaveSmbGlobal}
          onSaveAnsibleMarkers={handleSaveAnsibleMarkers}
        />
      </div>
    </Page>
  );
};
