import React, { useState, useEffect, useCallback, useRef } from "react";
import "@patternfly/react-core/dist/styles/base.css";
import "@cockpit-plugins/common/src/styles/cockpit-theme.css";
import { useCockpitTheme } from "@cockpit-plugins/common";
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

declare global {
  interface Window {
    cockpit?: any;
  }
}

const getSegmentsFromEnv = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash) {
    return hash.split("/").filter(Boolean);
  }
  if (typeof cockpit !== "undefined" && cockpit.location && Array.isArray(cockpit.location.path)) {
    const raw = cockpit.location.path;
    if (raw.length > 0 && ["file-sharing", "cockpit-file-sharing", "sharing", "index"].includes(raw[0].toLowerCase())) {
      return raw.slice(1);
    }
    return raw;
  }
  return [];
};

const parseView = (segments: string[]): string => {
  const cleanStr = segments.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (cleanStr.length === 0 || cleanStr[0] === "dashboard" || cleanStr[0] === "overview") {
    return "dashboard";
  }
  const viewKey = cleanStr[0];
  if (["dashboard", "smb", "nfs", "users", "sessions", "settings"].includes(viewKey)) {
    return viewKey;
  }
  return "dashboard";
};

export const App: React.FC = () => {
  useCockpitTheme();

  const [activeView, setActiveView] = useState<string>(() => {
    return parseView(getSegmentsFromEnv());
  });

  const lastNavigatedPathRef = useRef<string>("");

  const navigateToView = useCallback((view: string) => {
    setActiveView(view);
    lastNavigatedPathRef.current = view;

    const segments = view === "dashboard" ? [] : [view];
    if (typeof window !== "undefined") {
      const targetHash = segments.length > 0 ? `#/${segments.join("/")}` : "#/";
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, "", targetHash);
      }
    }
  }, []);

  const syncFromUrl = useCallback(() => {
    const segments = getSegmentsFromEnv();
    const currentPathStr = segments.length > 0 ? segments[0].toLowerCase() : "dashboard";
    if (currentPathStr === lastNavigatedPathRef.current) {
      return;
    }
    lastNavigatedPathRef.current = currentPathStr;
    setActiveView(parseView(segments));
  }, []);

  useEffect(() => {
    if (typeof cockpit !== "undefined" && cockpit.location) {
      const handleLocationChanged = () => syncFromUrl();
      cockpit.addEventListener("locationchanged", handleLocationChanged);
      return () => cockpit.removeEventListener("locationchanged", handleLocationChanged);
    }
  }, [syncFromUrl]);

  useEffect(() => {
    const handleHashChange = () => syncFromUrl();
    const handlePopState = () => syncFromUrl();
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [syncFromUrl]);

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

  const handleCreateGroup = async (name: string, members: string[]) => {
    await fileSharingApi.createSmbGroup(name, members);
    addAlert(`SMB group [${name}] created`);
    await loadData(true);
  };

  const handleModifyGroup = async (name: string, newName?: string, members?: string[]) => {
    await fileSharingApi.modifySmbGroup(name, newName, members);
    addAlert(`SMB group [${name}] updated`);
    await loadData(true);
  };

  const handleDeleteGroup = async (name: string) => {
    await fileSharingApi.deleteSmbGroup(name);
    addAlert(`SMB group [${name}] deleted`);
    await loadData(true);
  };

  const handleSaveNfsGlobal = async (nfs: any) => {
    await fileSharingApi.saveNfsGlobal(nfs);
    addAlert("Global NFS settings updated");
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
    addAlert("Configuration marker patterns updated");
  };

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      (window as any).__setActiveView = setActiveView;
      (window as any).__setFileSharingData = setData;
      (window as any).__addAlert = addAlert;
      (window as any).__handleSaveSmbShare = handleSaveSmbShare;
      (window as any).__handleDeleteSmbShare = handleDeleteSmbShare;
      (window as any).__handleSaveSmbGlobal = handleSaveSmbGlobal;
      (window as any).__handleSaveNfsExport = handleSaveNfsExport;
      (window as any).__handleDeleteNfsExport = handleDeleteNfsExport;
      (window as any).__handleCreateUser = handleCreateUser;
      (window as any).__handleSetUserPassword = handleSetUserPassword;
      (window as any).__handleSetUserState = handleSetUserState;
      (window as any).__handleDeleteUser = handleDeleteUser;
      (window as any).__handleCreateGroup = handleCreateGroup;
      (window as any).__handleModifyGroup = handleModifyGroup;
      (window as any).__handleDeleteGroup = handleDeleteGroup;
      (window as any).__handleSaveNfsGlobal = handleSaveNfsGlobal;
      (window as any).__handleServiceAction = handleServiceAction;
      (window as any).__handleSaveAnsibleMarkers = handleSaveAnsibleMarkers;
    }
  }, [loadData]);

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
    nfs: { exports: [], client_map: [], global: {} },
    users: { smb_users: [], unix_users: [], groups: [], access_matrix: [] },
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
        onSelectView={(view) => navigateToView(view)}
        onRefresh={() => loadData(false)}
        isLoading={refreshing}
      />

      {activeView === "dashboard" && (
        <DashboardView
          overview={overview}
          onNavigate={(view) => navigateToView(view)}
          onCreateSmbShare={() => navigateToView("smb")}
          onCreateNfsExport={() => navigateToView("nfs")}
          onAddUser={() => navigateToView("users")}
        />
      )}

      {activeView === "smb" && (
        <SmbSharesTab
          shares={overview.smb.shares}
          zfsMounts={overview.zfs_mounts}
          onSaveShare={handleSaveSmbShare}
          onDeleteShare={handleDeleteSmbShare}
        />
      )}

      {activeView === "nfs" && (
        <NfsExportsTab
          exports={overview.nfs.exports}
          clientMap={overview.nfs.client_map}
          zfsMounts={overview.zfs_mounts}
          onSaveExport={handleSaveNfsExport}
          onDeleteExport={handleDeleteNfsExport}
        />
      )}

      {activeView === "users" && (
        <UsersTab
          users={overview.users.smb_users}
          groups={overview.users.groups}
          unixUsers={overview.users.unix_users}
          accessMatrix={overview.users.access_matrix}
          onCreateUser={handleCreateUser}
          onSetPassword={handleSetUserPassword}
          onSetState={handleSetUserState}
          onDeleteUser={handleDeleteUser}
          onCreateGroup={handleCreateGroup}
          onModifyGroup={handleModifyGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      )}

      {activeView === "sessions" && (
        <SessionsTab
          services={overview.services}
          sessions={overview.sessions}
          onServiceAction={handleServiceAction}
          onRefresh={() => loadData(false)}
        />
      )}

      {activeView === "settings" && (
        <SettingsView
          globalSettings={overview.smb.global}
          nfsGlobal={overview.nfs.global}
          ansibleBegin={ansibleBegin}
          ansibleEnd={ansibleEnd}
          versions={overview.versions}
          onSaveGlobal={handleSaveSmbGlobal}
          onSaveNfsGlobal={handleSaveNfsGlobal}
          onSaveAnsibleMarkers={handleSaveAnsibleMarkers}
        />
      )}
    </Page>
  );
};

