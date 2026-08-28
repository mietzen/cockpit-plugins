import React, { useState, useEffect, useCallback } from "react";
import "@patternfly/react-core/dist/styles/base.css";
import "./styles/cockpit-theme.css";
import {
  Page,
  Alert,
  AlertGroup,
  AlertActionCloseButton,
  Spinner,
  PageSection,
} from "@patternfly/react-core";
import {
  SystemInfo,
  ZPool,
  ZDataset,
  ZSnapshot,
  DiskDevice,
} from "./types";
import { zfsApi } from "./api/zfsClient";
import { Navigation } from "./components/Navigation";
import { DashboardView } from "./components/DashboardView";
import { PoolsView } from "./components/PoolsView";
import { PoolDetailsView } from "./components/PoolDetailsView";
import { DisksView } from "./components/DisksView";
import { SettingsView } from "./components/SettingsView";
import { CreatePoolWizard } from "./components/CreatePoolWizard";
import { CreateDatasetModal } from "./components/Modals/CreateDatasetModal";
import { CreateZVolModal } from "./components/Modals/CreateZVolModal";
import { EditPropertiesModal } from "./components/Modals/EditPropertiesModal";
import { CreateSnapshotModal } from "./components/Modals/CreateSnapshotModal";
import { RollbackSnapshotModal } from "./components/Modals/RollbackSnapshotModal";
import { CloneSnapshotModal } from "./components/Modals/CloneSnapshotModal";
import { DestroyModal } from "./components/Modals/DestroyModal";
import { AttachDiskModal } from "./components/Modals/AttachDiskModal";
import { ReplaceDiskModal } from "./components/Modals/ReplaceDiskModal";
import { RenameModal } from "./components/Modals/RenameModal";
import { CommandPreviewModal } from "./components/CommandPreviewModal";

declare const cockpit: any;

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>("dashboard");
  const [selectedPoolName, setSelectedPoolName] = useState<string | null>(null);
  const [currentSubTab, setCurrentSubTab] = useState<string>("topology");

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pools, setPools] = useState<ZPool[]>([]);
  const [datasets, setDatasets] = useState<ZDataset[]>([]);
  const [snapshots, setSnapshots] = useState<ZSnapshot[]>([]);
  const [disks, setDisks] = useState<DiskDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Global Alerts
  const [alerts, setAlerts] = useState<
    Array<{ id: string; variant: "success" | "danger" | "warning" | "info"; title: string; message?: string }>
  >([]);

  // Modals state
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState(false);
  const [createDatasetParent, setCreateDatasetParent] = useState<string | null>(null);
  const [createZVolParent, setCreateZVolParent] = useState<string | null>(null);
  const [editPropertiesTarget, setEditPropertiesTarget] = useState<ZDataset | null>(null);
  const [createSnapshotTarget, setCreateSnapshotTarget] = useState<string | null>(null);
  const [rollbackSnapshotTarget, setRollbackSnapshotTarget] = useState<ZSnapshot | null>(null);
  const [cloneSnapshotTarget, setCloneSnapshotTarget] = useState<ZSnapshot | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    itemType: "dataset" | "volume" | "snapshot";
    currentName: string;
    originalSnapshot?: ZSnapshot;
  } | null>(null);
  const [destroyTarget, setDestroyTarget] = useState<{
    type: "pool" | "dataset" | "snapshot" | "snapshots";
    name: string;
  } | null>(null);
  const [attachTarget, setAttachTarget] = useState<{ poolName: string; existingDevice: string } | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<{ poolName: string; oldDevice: string } | null>(null);

  // Generic Command Preview Modal State
  const [previewModalState, setPreviewModalState] = useState<{
    isOpen: boolean;
    title: string;
    command: string[];
    description?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Parse path segments into route state
  const parseRoute = useCallback((segments: string[]) => {
    if (!segments || segments.length === 0 || segments[0] === "" || segments[0] === "dashboard" || segments[0] === "overview") {
      setActiveView((prev) => (prev === "dashboard" ? prev : "dashboard"));
      setSelectedPoolName(null);
      return;
    }

    const root = segments[0];
    if (root === "pools") {
      if (segments.length >= 2 && segments[1]) {
        setActiveView("pool-details");
        setSelectedPoolName(segments[1]);
        if (segments.length >= 3 && segments[2]) {
          setCurrentSubTab(segments[2]);
        } else {
          setCurrentSubTab("topology");
        }
      } else {
        setActiveView("pools");
        setSelectedPoolName(null);
      }
    } else if (root === "disks") {
      setActiveView("disks");
      setSelectedPoolName(null);
    } else if (root === "settings") {
      setActiveView("settings");
      setSelectedPoolName(null);
    } else {
      setActiveView("dashboard");
      setSelectedPoolName(null);
    }
  }, []);

  // Synchronize state from cockpit.location or window.location.hash
  const syncFromUrl = useCallback(() => {
    let segments: string[] = [];

    if (typeof cockpit !== "undefined" && cockpit.location && cockpit.location.path) {
      segments = cockpit.location.path;
    }

    if (segments.length === 0) {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash) {
        segments = hash.split("/").filter(Boolean);
      }
    }

    parseRoute(segments);
  }, [parseRoute]);

  // Navigate to a new route and update URL
  const navigateTo = useCallback((segments: string[]) => {
    parseRoute(segments);

    const pathStr = segments.join("/");
    const targetHash = `#/${pathStr}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }

    if (typeof cockpit !== "undefined" && cockpit.location && cockpit.location.go) {
      cockpit.location.go(segments);
    }
  }, [parseRoute]);

  // Listen to URL changes for browser Back / Forward buttons
  useEffect(() => {
    syncFromUrl();

    const handleHashChange = () => syncFromUrl();
    const handlePopState = () => syncFromUrl();

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handlePopState);

    let removeCockpitListener: (() => void) | null = null;
    if (typeof cockpit !== "undefined" && cockpit.location && cockpit.location.on) {
      cockpit.location.on("changed", syncFromUrl);
      removeCockpitListener = () => {
        if (cockpit.location.off) {
          cockpit.location.off("changed", syncFromUrl);
        }
      };
    }

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handlePopState);
      if (removeCockpitListener) {
        removeCockpitListener();
      }
    };
  }, [syncFromUrl]);

  const addAlert = (variant: "success" | "danger" | "warning" | "info", title: string, message?: string) => {
    const id = `alert-${Date.now()}-${Math.random()}`;
    setAlerts((prev) => [...prev, { id, variant, title, message }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 6000);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sysInfo, pList, dList, sList, diskList] = await Promise.all([
        zfsApi.getSystemInfo().catch(() => null),
        zfsApi.getPools().catch(() => []),
        zfsApi.getDatasets().catch(() => []),
        zfsApi.getSnapshots().catch(() => []),
        zfsApi.getDisks().catch(() => []),
      ]);

      setSystemInfo(sysInfo);
      setPools(pList);
      setDatasets(dList);
      setSnapshots(sList);
      setDisks(diskList);
    } catch (err: any) {
      addAlert("danger", "Failed to refresh data", err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const executeCmd = async (command: string[], successMsg: string) => {
    const result = await zfsApi.executeCommand(command);
    if (!result.success) {
      throw new Error(result.stderr || "Command failed");
    }
    addAlert("success", successMsg);
    await loadData();
  };

  const handleSelectPool = (poolName: string, subTab: string = "topology") => {
    navigateTo(["pools", poolName, subTab]);
  };

  const handleSubTabChange = (subTab: string) => {
    if (selectedPoolName) {
      setCurrentSubTab(subTab);
      navigateTo(["pools", selectedPoolName, subTab]);
    }
  };

  // Mutating Actions with Command Preview check
  const shouldPreview = () => localStorage.getItem("cockpit_zfs_preview") !== "false";

  const handleScrubAction = (poolName: string, action: "start" | "pause" | "stop") => {
    const cmd = ["zpool", "scrub"];
    if (action === "stop") cmd.push("-s");
    if (action === "pause") cmd.push("-p");
    cmd.push(poolName);

    const actionText = action === "start" ? "Start scrub" : action === "pause" ? "Pause scrub" : "Stop scrub";
    if (shouldPreview()) {
      setPreviewModalState({
        isOpen: true,
        title: `${actionText}: ${poolName}`,
        command: cmd,
        description: `Execute ${actionText.toLowerCase()} on storage pool ${poolName}.`,
        onConfirm: () => executeCmd(cmd, `Scrub action '${action}' completed on ${poolName}`),
      });
    } else {
      executeCmd(cmd, `Scrub action '${action}' completed on ${poolName}`).catch((err) =>
        addAlert("danger", "Scrub failed", err.message)
      );
    }
  };

  const handleTrimAction = (poolName: string, action: "start" | "suspend" | "stop") => {
    const cmd = ["zpool", "trim"];
    if (action === "stop") cmd.push("-c");
    if (action === "suspend") cmd.push("-d");
    cmd.push(poolName);

    const actionText = action === "start" ? "Start trim" : action === "suspend" ? "Suspend trim" : "Stop trim";
    if (shouldPreview()) {
      setPreviewModalState({
        isOpen: true,
        title: `${actionText}: ${poolName}`,
        command: cmd,
        description: `Execute ${actionText.toLowerCase()} on pool ${poolName}.`,
        onConfirm: () => executeCmd(cmd, `Trim action '${action}' completed on ${poolName}`),
      });
    } else {
      executeCmd(cmd, `Trim action '${action}' completed on ${poolName}`).catch((err) =>
        addAlert("danger", "Trim failed", err.message)
      );
    }
  };

  const handleClearErrors = (poolName: string, device?: string) => {
    const cmd = ["zpool", "clear", poolName];
    if (device) cmd.push(device);

    if (shouldPreview()) {
      setPreviewModalState({
        isOpen: true,
        title: `Clear errors: ${poolName}`,
        command: cmd,
        onConfirm: () => executeCmd(cmd, `Cleared error counters on ${poolName}`),
      });
    } else {
      executeCmd(cmd, `Cleared error counters on ${poolName}`).catch((err) =>
        addAlert("danger", "Clear errors failed", err.message)
      );
    }
  };

  const handleExportPool = (pool: ZPool) => {
    const cmd = ["zpool", "export", pool.name];
    setPreviewModalState({
      isOpen: true,
      title: `Export pool: ${pool.name}`,
      command: cmd,
      description: `Exporting pool ${pool.name} will unmount its datasets and release devices for import on another system.`,
      onConfirm: () => executeCmd(cmd, `Pool ${pool.name} exported`),
    });
  };

  const handleMountToggle = (dataset: ZDataset) => {
    const cmd = dataset.mounted ? ["zfs", "unmount", dataset.name] : ["zfs", "mount", dataset.name];
    const actionName = dataset.mounted ? "Unmounted" : "Mounted";
    executeCmd(cmd, `${actionName} dataset ${dataset.name}`).catch((err) =>
      addAlert("danger", `Failed to ${dataset.mounted ? "unmount" : "mount"}`, err.message)
    );
  };

  const handleRunSmartTest = (disk: DiskDevice, testType: "short" | "long") => {
    const cmd = ["smartctl", "-t", testType, disk.path];
    executeCmd(cmd, `Started SMART ${testType} self-test on ${disk.name}`).catch((err) =>
      addAlert("danger", "SMART test failed", err.message)
    );
  };

  const handleWipeDisk = (disk: DiskDevice) => {
    const cmd = ["wipefs", "-a", disk.path];
    setPreviewModalState({
      isOpen: true,
      title: `Wipe disk signatures: ${disk.name}`,
      command: cmd,
      isDestructive: true,
      description: `Wiping disk ${disk.path} will erase all partition tables and filesystem magic signatures.`,
      onConfirm: () => executeCmd(cmd, `Wiped signatures on ${disk.path}`),
    });
  };

  const selectedPool = pools.find((p) => p.name === selectedPoolName) || pools[0] || null;

  return (
    <Page>
      <Navigation
        activeView={activeView}
        onSelectView={(v) => {
          if (v === "pools") {
            navigateTo(["pools"]);
          } else if (v === "dashboard") {
            navigateTo([]);
          } else {
            navigateTo([v]);
          }
        }}
        onRefresh={loadData}
        isLoading={isLoading}
      />

      <AlertGroup isToast isLiveRegion style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 9999 }}>
        {alerts.map((a) => (
          <Alert
            key={a.id}
            variant={a.variant}
            title={a.title}
            actionClose={<AlertActionCloseButton onClose={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))} />}
          >
            {a.message}
          </Alert>
        ))}
      </AlertGroup>

      {isLoading && !systemInfo && pools.length === 0 ? (
        <PageSection style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
          <Spinner size="xl" />
        </PageSection>
      ) : (
        <>
          {activeView === "dashboard" && (
            <DashboardView
              systemInfo={systemInfo}
              pools={pools}
              onSelectPool={handleSelectPool}
              onCreatePool={() => setIsCreatePoolOpen(true)}
              onImportPool={() => {
                const cmd = ["zpool", "import", "-d", "/dev/disk/by-id", "-f"];
                setPreviewModalState({
                  isOpen: true,
                  title: "Import ZFS Pools",
                  command: cmd,
                  description: "Scan available disks and import discovered ZFS pools.",
                  onConfirm: () => executeCmd(cmd, "Import scan executed"),
                });
              }}
            />
          )}

          {activeView === "pools" && (
            <PoolsView
              pools={pools}
              onSelectPool={handleSelectPool}
              onCreatePool={() => setIsCreatePoolOpen(true)}
              onImportPool={() => {
                const cmd = ["zpool", "import", "-d", "/dev/disk/by-id", "-f"];
                setPreviewModalState({
                  isOpen: true,
                  title: "Import ZFS Pools",
                  command: cmd,
                  description: "Scan available disks and import discovered ZFS pools.",
                  onConfirm: () => executeCmd(cmd, "Import scan executed"),
                });
              }}
              onDestroyPool={(p) => setDestroyTarget({ type: "pool", name: p.name })}
              onExportPool={handleExportPool}
              onScrubPool={(p, act) => handleScrubAction(p.name, act)}
              onTrimPool={(p, act) => handleTrimAction(p.name, act)}
            />
          )}

          {activeView === "pool-details" && selectedPool && (
            <PoolDetailsView
              pool={selectedPool}
              datasets={datasets}
              snapshots={snapshots}
              activeTab={currentSubTab}
              onTabChange={handleSubTabChange}
              onBack={() => {
                navigateTo(["pools"]);
              }}
              onAttachDisk={(pName, dev) => setAttachTarget({ poolName: pName, existingDevice: dev })}
              onDetachDisk={(pName, dev) => {
                const cmd = ["zpool", "detach", pName, dev];
                setPreviewModalState({
                  isOpen: true,
                  title: `Detach Device: ${dev}`,
                  command: cmd,
                  description: `Detach mirror device ${dev} from pool ${pName}.`,
                  onConfirm: () => executeCmd(cmd, `Detached ${dev}`),
                });
              }}
              onOfflineDisk={(pName, dev) => {
                const cmd = ["zpool", "offline", pName, dev];
                executeCmd(cmd, `Offlined ${dev}`).catch((err) => addAlert("danger", "Offline failed", err.message));
              }}
              onOnlineDisk={(pName, dev) => {
                const cmd = ["zpool", "online", pName, dev];
                executeCmd(cmd, `Onlined ${dev}`).catch((err) => addAlert("danger", "Online failed", err.message));
              }}
              onReplaceDisk={(pName, dev) => setReplaceTarget({ poolName: pName, oldDevice: dev })}
              onClearErrors={handleClearErrors}
              onTrimDisk={(pName, dev) => {
                const cmd = ["zpool", "trim", pName, dev];
                executeCmd(cmd, `Started trim on ${dev}`).catch((err) => addAlert("danger", "Trim failed", err.message));
              }}
              onCreateDataset={(p) => setCreateDatasetParent(p || selectedPool.name)}
              onCreateZVol={(p) => setCreateZVolParent(p || selectedPool.name)}
              onEditProperties={(ds) => setEditPropertiesTarget(ds)}
              onCreateSnapshot={(ds) => setCreateSnapshotTarget(ds ? ds.name : selectedPool.name)}
              onMountToggle={handleMountToggle}
              onRenameDataset={(ds) => {
                setRenameTarget({
                  itemType: ds.type === "volume" ? "volume" : "dataset",
                  currentName: ds.name,
                });
              }}
              onDestroyDataset={(ds) => setDestroyTarget({ type: "dataset", name: ds.name })}
              onRollbackSnapshot={(s) => setRollbackSnapshotTarget(s)}
              onCloneSnapshot={(s) => setCloneSnapshotTarget(s)}
              onRenameSnapshot={(s) => {
                setRenameTarget({
                  itemType: "snapshot",
                  currentName: s.snapshot_name,
                  originalSnapshot: s,
                });
              }}
              onDestroySnapshot={(s) => setDestroyTarget({ type: "snapshot", name: s.name })}
              onBulkDestroySnapshots={(snaps) => {
                const names = snaps.map((s) => s.name);
                setDestroyTarget({ type: "snapshots", name: names.join(" ") });
              }}
              onScrubAction={handleScrubAction}
              onTrimAction={handleTrimAction}
              onSaveProperties={(pName, props) => {
                const cmds: string[][] = Object.entries(props).map(([k, v]) => ["zpool", "set", `${k}=${v}`, pName]);
                const runAll = async () => {
                  for (const c of cmds) {
                    await executeCmd(c, `Updated pool property`);
                  }
                };
                if (shouldPreview()) {
                  setPreviewModalState({
                    isOpen: true,
                    title: `Update pool properties: ${pName}`,
                    command: cmds.map((c) => c.join(" ")),
                    onConfirm: runAll,
                  });
                } else {
                  runAll().catch((err) => addAlert("danger", "Update properties failed", err.message));
                }
              }}
            />
          )}

          {activeView === "disks" && (
            <DisksView
              disks={disks}
              onWipeDisk={handleWipeDisk}
              onRunSmartTest={handleRunSmartTest}
            />
          )}

          {activeView === "settings" && <SettingsView systemInfo={systemInfo} />}
        </>
      )}

      {/* Modals & Wizards */}
      <CreatePoolWizard
        isOpen={isCreatePoolOpen}
        availableDisks={disks}
        onClose={() => setIsCreatePoolOpen(false)}
        onCreatePool={async ({ command }) => {
          await executeCmd(command, "Pool created successfully");
        }}
      />

      <CreateDatasetModal
        isOpen={!!createDatasetParent}
        parentPath={createDatasetParent || ""}
        onClose={() => setCreateDatasetParent(null)}
        onSubmit={async ({ command }) => {
          await executeCmd(command, "Dataset created successfully");
        }}
      />

      <CreateZVolModal
        isOpen={!!createZVolParent}
        parentPath={createZVolParent || ""}
        onClose={() => setCreateZVolParent(null)}
        onSubmit={async ({ command }) => {
          await executeCmd(command, "ZVol created successfully");
        }}
      />

      <EditPropertiesModal
        isOpen={!!editPropertiesTarget}
        dataset={editPropertiesTarget}
        onClose={() => setEditPropertiesTarget(null)}
        onSubmit={async ({ commands }) => {
          for (const cmd of commands) {
            await executeCmd(cmd, "Dataset property updated");
          }
        }}
      />

      <CreateSnapshotModal
        isOpen={!!createSnapshotTarget}
        defaultDataset={createSnapshotTarget || ""}
        onClose={() => setCreateSnapshotTarget(null)}
        onSubmit={async ({ command }) => {
          await executeCmd(command, "Snapshot created successfully");
        }}
      />

      <RollbackSnapshotModal
        isOpen={!!rollbackSnapshotTarget}
        snapshot={rollbackSnapshotTarget}
        onClose={() => setRollbackSnapshotTarget(null)}
        onSubmit={async ({ command }) => {
          await executeCmd(command, "Dataset rolled back successfully");
        }}
      />

      <CloneSnapshotModal
        isOpen={!!cloneSnapshotTarget}
        snapshot={cloneSnapshotTarget}
        onClose={() => setCloneSnapshotTarget(null)}
        onSubmit={async ({ command }) => {
          await executeCmd(command, "Clone created successfully");
        }}
      />

      {renameTarget && (
        <RenameModal
          isOpen={true}
          itemType={renameTarget.itemType}
          currentName={renameTarget.currentName}
          onClose={() => setRenameTarget(null)}
          onRename={async (newName) => {
            if (renameTarget.itemType === "snapshot" && renameTarget.originalSnapshot) {
              const target = `${renameTarget.originalSnapshot.dataset}@${newName.trim()}`;
              const cmd = ["zfs", "rename", renameTarget.originalSnapshot.name, target];
              await executeCmd(cmd, `Renamed snapshot to @${newName}`);
            } else {
              const cmd = ["zfs", "rename", renameTarget.currentName, newName.trim()];
              await executeCmd(cmd, `Renamed ${renameTarget.itemType} to ${newName}`);
            }
          }}
        />
      )}

      {destroyTarget && (
        <DestroyModal
          isOpen={true}
          itemType={destroyTarget.type}
          itemName={destroyTarget.name}
          onClose={() => setDestroyTarget(null)}
          onConfirm={async ({ command }) => {
            await executeCmd(command, `Destroyed ${destroyTarget.type}`);
          }}
        />
      )}

      {attachTarget && (
        <AttachDiskModal
          isOpen={true}
          poolName={attachTarget.poolName}
          existingDevice={attachTarget.existingDevice}
          availableDisks={disks.filter((d) => !d.pool)}
          onClose={() => setAttachTarget(null)}
          onSubmit={async ({ command }) => {
            await executeCmd(command, "Device attached to mirror");
          }}
        />
      )}

      {replaceTarget && (
        <ReplaceDiskModal
          isOpen={true}
          poolName={replaceTarget.poolName}
          oldDevice={replaceTarget.oldDevice}
          availableDisks={disks.filter((d) => !d.pool)}
          onClose={() => setReplaceTarget(null)}
          onSubmit={async ({ command }) => {
            await executeCmd(command, "Device replacement initiated");
          }}
        />
      )}

      {previewModalState && (
        <CommandPreviewModal
          isOpen={previewModalState.isOpen}
          title={previewModalState.title}
          command={previewModalState.command}
          description={previewModalState.description}
          isDestructive={previewModalState.isDestructive}
          onConfirm={previewModalState.onConfirm}
          onCancel={() => setPreviewModalState(null)}
        />
      )}
    </Page>
  );
};
