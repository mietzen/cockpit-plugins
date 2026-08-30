import React, { useState, useEffect, useCallback, useRef } from "react";
import "@patternfly/react-core/dist/styles/base.css";
import "@cockpit-plugins/common/src/styles/cockpit-theme.css";
import { useCockpitTheme } from "@cockpit-plugins/common";
import {
  Alert,
  AlertGroup,
  AlertActionCloseButton,
} from "@patternfly/react-core";
import {
  SystemInfo,
  ZPool,
  ZDataset,
  ZSnapshot,
  DiskDevice,
  CommandResult,
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
import { ArcDetailsModal } from "./components/Modals/ArcDetailsModal";
import { SmartDetailsModal } from "./components/Modals/SmartDetailsModal";
import { CommandPreviewModal } from "./components/CommandPreviewModal";
import { formatBytes, formatPercentage, formatDate, getHealthBadgeColor } from "./utils/formatters";

declare const cockpit: any;

interface AppRoute {
  view: "dashboard" | "pools" | "pool-details" | "disks" | "settings";
  poolName: string | null;
  subTab: string;
}

type ActiveModal =
  | { type: "create-pool" }
  | { type: "arc-details" }
  | { type: "smart-details"; disk: DiskDevice }
  | { type: "create-dataset"; parent: string }
  | { type: "create-zvol"; parent: string }
  | { type: "edit-properties"; dataset: ZDataset }
  | { type: "create-snapshot"; target: string }
  | { type: "rollback-snapshot"; snapshot: ZSnapshot }
  | { type: "clone-snapshot"; snapshot: ZSnapshot }
  | {
      type: "rename";
      itemType: "dataset" | "volume" | "snapshot";
      currentName: string;
      originalSnapshot?: ZSnapshot;
    }
  | {
      type: "destroy";
      itemType: "pool" | "dataset" | "snapshot" | "snapshots";
      itemName: string;
    }
  | {
      type: "attach";
      poolName: string;
      existingDevice: string;
    }
  | {
      type: "replace";
      poolName: string;
      oldDevice: string;
    }
  | {
      type: "preview";
      title: string;
      command: string[];
      description?: string;
      isDestructive?: boolean;
      onConfirm: () => Promise<void>;
    }
  | null;

const parseRoute = (segments: string[]): AppRoute => {
  let clean = segments ? [...segments] : [];
  if (clean.length > 0 && (clean[0] === "zfs-storage" || clean[0] === "cockpit-zfs")) {
    clean = clean.slice(1);
  }

  if (!clean || clean.length === 0 || clean[0] === "" || clean[0] === "dashboard" || clean[0] === "overview") {
    return { view: "dashboard", poolName: null, subTab: "topology" };
  }

  const root = clean[0];
  if (root === "pools") {
    if (clean.length >= 2 && clean[1]) {
      const subTab = clean.length >= 3 && clean[2] ? clean[2] : "topology";
      return { view: "pool-details", poolName: clean[1], subTab };
    }
    return { view: "pools", poolName: null, subTab: "topology" };
  }
  if (root === "disks") {
    return { view: "disks", poolName: null, subTab: "topology" };
  }
  if (root === "settings") {
    return { view: "settings", poolName: null, subTab: "topology" };
  }
  return { view: "dashboard", poolName: null, subTab: "topology" };
};

export const App: React.FC = () => {
  useCockpitTheme();

  const [route, setRoute] = useState<AppRoute>(() => {
    let initialSegments: string[] = [];
    if (typeof cockpit !== "undefined" && cockpit.location && Array.isArray(cockpit.location.path)) {
      initialSegments = cockpit.location.path;
    } else {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash) {
        initialSegments = hash.split("/").filter(Boolean);
      }
    }
    return parseRoute(initialSegments);
  });

  const lastNavigatedPathRef = useRef<string>("");

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pools, setPools] = useState<ZPool[]>([]);
  const [datasets, setDatasets] = useState<ZDataset[]>([]);
  const [snapshots, setSnapshots] = useState<ZSnapshot[]>([]);
  const [disks, setDisks] = useState<DiskDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Global Alerts
  const [alerts, setAlerts] = useState<
    Array<{ id: string; variant: "success" | "danger" | "warning" | "info"; title: string; message?: string }>
  >([]);

  // Consolidated Modal State (resolves state bloat)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);



  const navigateTo = useCallback((segments: string[]) => {
    const nextRoute = parseRoute(segments);
    setRoute(nextRoute);

    const fullPathStr = segments.join("/");
    lastNavigatedPathRef.current = fullPathStr;

    const targetHash = segments.length > 0 ? `#/${segments.join("/")}` : "#/";
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, "", targetHash);
    }
  }, []);

  const syncFromUrl = useCallback(() => {
    let segments: string[] = [];
    if (typeof cockpit !== "undefined" && cockpit.location && Array.isArray(cockpit.location.path)) {
      segments = cockpit.location.path;
    } else {
      const hash = window.location.hash.replace(/^#\/?/, "");
      if (hash) {
        segments = hash.split("/").filter(Boolean);
      }
    }

    const currentPathStr = segments.join("/");
    if (currentPathStr === lastNavigatedPathRef.current) {
      return;
    }

    lastNavigatedPathRef.current = currentPathStr;
    setRoute(parseRoute(segments));
  }, []);

  useEffect(() => {
    if (typeof cockpit !== "undefined" && cockpit.location) {
      const handleLocationChanged = () => {
        syncFromUrl();
      };
      cockpit.addEventListener("locationchanged", handleLocationChanged);
      return () => {
        cockpit.removeEventListener("locationchanged", handleLocationChanged);
      };
    }
  }, [syncFromUrl]);

  useEffect(() => {
    const handleHashChange = () => {
      syncFromUrl();
    };
    const handlePopState = () => {
      syncFromUrl();
    };

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handlePopState);
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

  const runAction = async (actionPromise: Promise<CommandResult>, successMsg: string) => {
    const res = await actionPromise;
    if (!res.success) {
      throw new Error(res.stderr || "Operation failed");
    }
    addAlert("success", successMsg);
    await loadData();
  };

  const handleSelectPool = (poolName: string, subTab: string = "topology") => {
    navigateTo(["pools", poolName, subTab]);
  };

  const handleSubTabChange = (subTab: string) => {
    if (route.poolName) {
      navigateTo(["pools", route.poolName, subTab]);
    }
  };

  const handleViewSmartDetails = (device: DiskDevice | string) => {
    if (typeof device === "string") {
      const baseName = device.replace(/^\/dev\//, "");
      const found = disks.find(
        (d) => d.name === baseName || d.path === device || d.path === `/dev/${baseName}`
      );
      if (found) {
        setActiveModal({ type: "smart-details", disk: found });
      } else {
        setActiveModal({
          type: "smart-details",
          disk: {
            name: baseName,
            path: device.startsWith("/dev/") ? device : `/dev/${device}`,
            size: 0,
            model: "Generic Disk",
            serial: "-",
            wwn: "-",
            rotational: false,
            smart_health: "UNKNOWN",
            temperature: null,
            transport: "sata",
            pool: null,
            partitions: [],
          },
        });
      }
    } else {
      setActiveModal({ type: "smart-details", disk: device });
    }
  };

  const shouldPreview = () => localStorage.getItem("cockpit_zfs_preview") !== "false";

  const handleScrubAction = (poolName: string, action: "start" | "pause" | "stop") => {
    const cmd = ["zpool", "scrub", ...(action === "stop" ? ["-s"] : action === "pause" ? ["-p"] : []), poolName];
    const actionText = action === "start" ? "Start scrub" : action === "pause" ? "Pause scrub" : "Stop scrub";
    if (shouldPreview()) {
      setActiveModal({
        type: "preview",
        title: `${actionText}: ${poolName}`,
        command: cmd,
        description: `Execute ${actionText.toLowerCase()} on storage pool ${poolName}.`,
        onConfirm: () => runAction(zfsApi.scrubPool(poolName, action), `Scrub action '${action}' completed on ${poolName}`),
      });
    } else {
      runAction(zfsApi.scrubPool(poolName, action), `Scrub action '${action}' completed on ${poolName}`).catch((err) =>
        addAlert("danger", "Scrub failed", err.message)
      );
    }
  };

  const handleTrimAction = (poolName: string, action: "start" | "suspend" | "stop") => {
    const cmd = ["zpool", "trim", ...(action === "stop" ? ["-c"] : action === "suspend" ? ["-d"] : []), poolName];
    const actionText = action === "start" ? "Start trim" : action === "suspend" ? "Suspend trim" : "Stop trim";
    if (shouldPreview()) {
      setActiveModal({
        type: "preview",
        title: `${actionText}: ${poolName}`,
        command: cmd,
        description: `Execute ${actionText.toLowerCase()} on pool ${poolName}.`,
        onConfirm: () => runAction(zfsApi.trimPool(poolName, action), `Trim action '${action}' completed on ${poolName}`),
      });
    } else {
      runAction(zfsApi.trimPool(poolName, action), `Trim action '${action}' completed on ${poolName}`).catch((err) =>
        addAlert("danger", "Trim failed", err.message)
      );
    }
  };

  const handleClearErrors = (poolName: string, device?: string) => {
    const cmd = ["zpool", "clear", poolName, ...(device ? [device] : [])];
    if (shouldPreview()) {
      setActiveModal({
        type: "preview",
        title: `Clear errors: ${poolName}`,
        command: cmd,
        onConfirm: () => runAction(zfsApi.clearPool(poolName, device), `Cleared error counters on ${poolName}`),
      });
    } else {
      runAction(zfsApi.clearPool(poolName, device), `Cleared error counters on ${poolName}`).catch((err) =>
        addAlert("danger", "Clear errors failed", err.message)
      );
    }
  };

  const handleExportPool = (pool: ZPool) => {
    const cmd = ["zpool", "export", pool.name];
    setActiveModal({
      type: "preview",
      title: `Export pool: ${pool.name}`,
      command: cmd,
      description: `Exporting pool ${pool.name} will unmount its datasets and release devices for import on another system.`,
      onConfirm: () => runAction(zfsApi.exportPool(pool.name), `Pool ${pool.name} exported`),
    });
  };

  const handleMountToggle = (dataset: ZDataset) => {
    if (dataset.mounted) {
      runAction(zfsApi.unmountDataset(dataset.name), `Unmounted dataset ${dataset.name}`).catch((err) =>
        addAlert("danger", "Failed to unmount", err.message)
      );
    } else {
      runAction(zfsApi.mountDataset(dataset.name), `Mounted dataset ${dataset.name}`).catch((err) =>
        addAlert("danger", "Failed to mount", err.message)
      );
    }
  };

  const selectedPool = pools.find((p) => p.name === route.poolName) || pools[0] || null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__setActiveModal = setActiveModal;
      (window as any).__setDisks = setDisks;
      (window as any).__setPools = setPools;
      (window as any).__setDatasets = setDatasets;
      (window as any).__setSnapshots = setSnapshots;
      (window as any).__setSystemInfo = setSystemInfo;
      (window as any).__addAlert = addAlert;
      (window as any).__navigateTo = navigateTo;
      (window as any).__handleScrubAction = handleScrubAction;
      (window as any).__handleTrimAction = handleTrimAction;
      (window as any).__handleClearErrors = handleClearErrors;
      (window as any).__handleViewSmartDetails = handleViewSmartDetails;
      (window as any).__handleSubTabChange = handleSubTabChange;
      (window as any).__handleSelectPool = handleSelectPool;
      (window as any).__handleExportPool = handleExportPool;
      (window as any).__handleMountToggle = handleMountToggle;
      (window as any).__formatters = { formatBytes, formatPercentage, formatDate, getHealthBadgeColor };
      (window as any).__appActionHandlers = {
        poolWizardDone: handlePoolWizardDone,
        createDataset: handleCreateDataset,
        createZVol: handleCreateZVol,
        editProperties: handleEditProperties,
        createSnapshot: handleCreateSnapshot,
        rollbackSnapshot: handleRollbackSnapshot,
        cloneSnapshot: handleCloneSnapshot,
        rename: handleRename,
        attachDisk: handleAttachDisk,
        replaceDisk: handleReplaceDisk,
        wipeDisk: handleWipeDisk,
        runSmartTest: handleRunSmartTest,
        destroy: handleDestroy,
        bulkDestroySnapshots: (names: string[]) => {
          setSelectedDestroyTarget({ type: "snapshot", name: names.join(", "), snapshotCount: names.length });
          setActiveModal("destroy");
        },
      };
    }
  });

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--zfs-canvas-bg)", color: "var(--zfs-text-primary)" }}>
      <Navigation
        activeView={route.view}
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
        {alerts.map((a) => {
          const prefixMap: Record<string, string> = {
            success: "Success: ",
            danger: "Failed: ",
            warning: "Warning: ",
            info: "Info: ",
          };
          const prefix = prefixMap[a.variant] || "";
          const cleanTitle = a.title.replace(/^(success|danger|warning|info)\s+alert:\s*/i, "");
          const displayTitle = cleanTitle.startsWith(prefix) ? cleanTitle : `${prefix}${cleanTitle}`;

          return (
            <Alert
              key={a.id}
              variant={a.variant}
              title={displayTitle}
              actionClose={
                <AlertActionCloseButton
                  onClose={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                />
              }
            >
              {a.message}
            </Alert>
          );
        })}
      </AlertGroup>

      {/* In-Memory Persistent Views for Zero-Flicker Redraw */}
      <div style={{ display: route.view === "dashboard" ? "block" : "none" }}>
        <DashboardView
          systemInfo={systemInfo}
          pools={pools}
          disks={disks}
          onSelectPool={handleSelectPool}
          onCreatePool={() => setActiveModal({ type: "create-pool" })}
          onImportPool={() => {
            const cmd = ["zpool", "import", "-d", "/dev/disk/by-id", "-f"];
            setActiveModal({
              type: "preview",
              title: "Import ZFS Pools",
              command: cmd,
              description: "Scan available disks and import discovered ZFS pools.",
              onConfirm: () => runAction(zfsApi.importPool({ force: true }), "Import scan executed"),
            });
          }}
          onViewArcDetails={() => setActiveModal({ type: "arc-details" })}
          onViewSmartDetails={handleViewSmartDetails}
        />
      </div>

      <div style={{ display: route.view === "pools" ? "block" : "none" }}>
        <PoolsView
          pools={pools}
          isLoading={isLoading}
          onSelectPool={handleSelectPool}
          onCreatePool={() => setActiveModal({ type: "create-pool" })}
          onImportPool={() => {
            const cmd = ["zpool", "import", "-d", "/dev/disk/by-id", "-f"];
            setActiveModal({
              type: "preview",
              title: "Import ZFS Pools",
              command: cmd,
              description: "Scan available disks and import discovered ZFS pools.",
              onConfirm: () => runAction(zfsApi.importPool({ force: true }), "Import scan executed"),
            });
          }}
          onDestroyPool={(p) => setActiveModal({ type: "destroy", itemType: "pool", itemName: p.name })}
          onExportPool={handleExportPool}
          onScrubPool={(p, act) => handleScrubAction(p.name, act)}
          onTrimPool={(p, act) => handleTrimAction(p.name, act)}
        />
      </div>

      <div style={{ display: route.view === "pool-details" && selectedPool ? "block" : "none" }}>
        {selectedPool && (
          <PoolDetailsView
            pool={selectedPool}
            datasets={datasets}
            snapshots={snapshots}
            isLoading={isLoading}
            activeTab={route.subTab}
            onTabChange={handleSubTabChange}
            onBack={() => {
              navigateTo(["pools"]);
            }}
            onAttachDisk={(pName, dev) => setActiveModal({ type: "attach", poolName: pName, existingDevice: dev })}
            onDetachDisk={(pName, dev) => {
              const cmd = ["zpool", "detach", pName, dev];
              setActiveModal({
                type: "preview",
                title: `Detach Device: ${dev}`,
                command: cmd,
                description: `Detach mirror device ${dev} from pool ${pName}.`,
                onConfirm: () => runAction(zfsApi.diskAction("detach", pName, dev), `Detached ${dev}`),
              });
            }}
            onOfflineDisk={(pName, dev) => {
              runAction(zfsApi.diskAction("offline", pName, dev), `Offlined ${dev}`).catch((err) =>
                addAlert("danger", "Offline failed", err.message)
              );
            }}
            onOnlineDisk={(pName, dev) => {
              runAction(zfsApi.diskAction("online", pName, dev), `Onlined ${dev}`).catch((err) =>
                addAlert("danger", "Online failed", err.message)
              );
            }}
            onReplaceDisk={(pName, dev) => setActiveModal({ type: "replace", poolName: pName, oldDevice: dev })}
            onClearErrors={handleClearErrors}
            onTrimDisk={(pName, dev) => {
              runAction(zfsApi.trimPool(pName, "start", dev), `Started trim on ${dev}`).catch((err) =>
                addAlert("danger", "Trim failed", err.message)
              );
            }}
            onCreateDataset={(p) => setActiveModal({ type: "create-dataset", parent: p || selectedPool.name })}
            onCreateZVol={(p) => setActiveModal({ type: "create-zvol", parent: p || selectedPool.name })}
            onEditProperties={(ds) => setActiveModal({ type: "edit-properties", dataset: ds })}
            onCreateSnapshot={(ds) =>
              setActiveModal({
                type: "create-snapshot",
                target: typeof ds === "string" ? ds : ds ? ds.name : selectedPool.name,
              })
            }
            onMountToggle={handleMountToggle}
            onRenameDataset={(ds) => {
              setActiveModal({
                type: "rename",
                itemType: ds.type === "volume" ? "volume" : "dataset",
                currentName: ds.name,
              });
            }}
            onDestroyDataset={(ds) => setActiveModal({ type: "destroy", itemType: "dataset", itemName: ds.name })}
            onRollbackSnapshot={(s) => setActiveModal({ type: "rollback-snapshot", snapshot: s })}
            onCloneSnapshot={(s) => setActiveModal({ type: "clone-snapshot", snapshot: s })}
            onRenameSnapshot={(s) => {
              setActiveModal({
                type: "rename",
                itemType: "snapshot",
                currentName: s.snapshot_name,
                originalSnapshot: s,
              });
            }}
            onDestroySnapshot={(s) => setActiveModal({ type: "destroy", itemType: "snapshot", itemName: s.name })}
            onBulkDestroySnapshots={(snaps) => {
              const names = snaps.map((s) => s.name);
              setActiveModal({ type: "destroy", itemType: "snapshots", itemName: names.join(" ") });
            }}
            onScrubAction={handleScrubAction}
            onTrimAction={handleTrimAction}
            onSaveProperties={(pName, props) => {
              const runAll = async () => {
                for (const [k, v] of Object.entries(props)) {
                  await zfsApi.setPoolProperty(pName, k, v);
                }
                addAlert("success", "Updated pool properties");
                await loadData();
              };
              if (shouldPreview()) {
                setActiveModal({
                  type: "preview",
                  title: `Update pool properties: ${pName}`,
                  command: Object.entries(props).map(([k, v]) => `zpool set ${k}=${v} ${pName}`),
                  onConfirm: runAll,
                });
              } else {
                runAll().catch((err) => addAlert("danger", "Update properties failed", err.message));
              }
            }}
            onViewSmartDetails={handleViewSmartDetails}
          />
        )}
      </div>

      <div style={{ display: route.view === "disks" ? "block" : "none" }}>
        <DisksView
          disks={disks}
          onWipeDisk={() => {}}
          onRunSmartTest={() => {}}
          onViewSmartDetails={handleViewSmartDetails}
        />
      </div>

      <div style={{ display: route.view === "settings" ? "block" : "none" }}>
        <SettingsView systemInfo={systemInfo} />
      </div>

      {/* Modals & Wizards */}
      <CreatePoolWizard
        isOpen={activeModal?.type === "create-pool"}
        availableDisks={disks}
        onClose={() => setActiveModal(null)}
        onCreatePool={async (args) => {
          const vdevs = args.vdevs.map((v) => ({ type: v.type, devices: v.devices }));
          await runAction(
            zfsApi.createPool({
              name: args.name,
              vdevs,
              ashift: args.ashift,
              compression: args.compression,
              altroot: args.altroot,
              force: true,
              properties: {
                ...(args.dedup !== "off" ? { dedup: args.dedup } : {}),
                ...(args.atime === false ? { atime: "off" } : {}),
                ...(args.sync !== "standard" ? { sync: args.sync } : {}),
                ...(args.recordsize ? { recordsize: args.recordsize } : {}),
                ...(args.autoexpand ? { autoexpand: "on" } : {}),
                ...(args.autoreplace ? { autoreplace: "on" } : {}),
                ...(args.autotrim ? { autotrim: "on" } : {}),
              },
            }),
            `Pool ${args.name} created successfully`
          );
          setActiveModal(null);
        }}
      />

      <ArcDetailsModal
        isOpen={activeModal?.type === "arc-details"}
        arcStats={systemInfo?.arc}
        onClose={() => setActiveModal(null)}
      />

      <CreateDatasetModal
        isOpen={activeModal?.type === "create-dataset"}
        parentPath={activeModal?.type === "create-dataset" ? activeModal.parent : ""}
        onClose={() => setActiveModal(null)}
        onSubmit={async (args) => {
          const properties: Record<string, string> = {};
          if (args.compression !== "off") properties.compression = args.compression;
          if (args.dedup !== "off") properties.dedup = args.dedup;
          if (args.quota) properties.quota = args.quota;
          if (args.recordsize) properties.recordsize = args.recordsize;
          if (!args.atime) properties.atime = "off";
          if (args.sync !== "standard") properties.sync = args.sync;
          if (args.mountpoint) properties.mountpoint = args.mountpoint;

          await runAction(
            zfsApi.createDataset({
              path: args.path,
              type: "filesystem",
              properties: Object.keys(properties).length > 0 ? properties : undefined,
            }),
            `Dataset ${args.path} created successfully`
          );
          setActiveModal(null);
        }}
      />

      <CreateZVolModal
        isOpen={activeModal?.type === "create-zvol"}
        parentPath={activeModal?.type === "create-zvol" ? activeModal.parent : ""}
        onClose={() => setActiveModal(null)}
        onSubmit={async (args) => {
          const properties: Record<string, string> = {};
          if (args.compression !== "off") properties.compression = args.compression;
          if (args.dedup !== "off") properties.dedup = args.dedup;
          if (args.sync !== "standard") properties.sync = args.sync;

          await runAction(
            zfsApi.createDataset({
              path: args.path,
              type: "volume",
              size: args.size,
              volblocksize: args.volblocksize || undefined,
              sparse: args.sparse,
              properties: Object.keys(properties).length > 0 ? properties : undefined,
            }),
            `Volume ${args.path} created successfully`
          );
          setActiveModal(null);
        }}
      />

      <EditPropertiesModal
        isOpen={activeModal?.type === "edit-properties"}
        dataset={activeModal?.type === "edit-properties" ? activeModal.dataset : null}
        onClose={() => setActiveModal(null)}
        onSubmit={async ({ dataset, properties, inheritProperties }) => {
          for (const [k, v] of Object.entries(properties)) {
            await zfsApi.setDatasetProperty(dataset.name, k, v);
          }
          for (const prop of inheritProperties) {
            await zfsApi.inheritDatasetProperty(dataset.name, prop);
          }
          addAlert("success", "Dataset properties updated");
          await loadData();
          setActiveModal(null);
        }}
      />

      <CreateSnapshotModal
        isOpen={activeModal?.type === "create-snapshot"}
        defaultDataset={activeModal?.type === "create-snapshot" ? activeModal.target : ""}
        availableDatasets={
          selectedPool
            ? [
                selectedPool.name,
                ...datasets
                  .filter((d) => d.name.startsWith(`${selectedPool.name}/`) || d.name === selectedPool.name)
                  .map((d) => d.name),
              ]
            : datasets.map((d) => d.name)
        }
        onClose={() => setActiveModal(null)}
        onSubmit={async (args) => {
          await runAction(
            zfsApi.createSnapshot({
              path: args.dataset,
              name: args.snapshotName,
              recursive: args.recursive,
            }),
            `Snapshot @${args.snapshotName} created successfully`
          );
          setActiveModal(null);
        }}
      />

      <RollbackSnapshotModal
        isOpen={activeModal?.type === "rollback-snapshot"}
        snapshot={activeModal?.type === "rollback-snapshot" ? activeModal.snapshot : null}
        onClose={() => setActiveModal(null)}
        onSubmit={async (args) => {
          await runAction(
            zfsApi.rollbackSnapshot(args.snapshot.name, args.destroyIntermediate),
            `Dataset rolled back to @${args.snapshot.snapshot_name}`
          );
          setActiveModal(null);
        }}
      />

      <CloneSnapshotModal
        isOpen={activeModal?.type === "clone-snapshot"}
        snapshot={activeModal?.type === "clone-snapshot" ? activeModal.snapshot : null}
        onClose={() => setActiveModal(null)}
        onSubmit={async (args) => {
          await runAction(
            zfsApi.cloneSnapshot({
              snapshot: args.snapshot.name,
              clone_path: args.clonePath,
              properties: args.compression !== "off" ? { compression: args.compression } : undefined,
            }),
            `Clone ${args.clonePath} created successfully`
          );
          setActiveModal(null);
        }}
      />

      {activeModal?.type === "rename" && (
        <RenameModal
          isOpen={true}
          itemType={activeModal.itemType}
          currentName={activeModal.currentName}
          onClose={() => setActiveModal(null)}
          onRename={async (newName) => {
            if (activeModal.itemType === "snapshot" && activeModal.originalSnapshot) {
              const target = `${activeModal.originalSnapshot.dataset}@${newName.trim()}`;
              await runAction(
                zfsApi.renameDataset(activeModal.originalSnapshot.name, target),
                `Renamed snapshot to @${newName}`
              );
            } else {
              let targetPath = newName.trim();
              if (!targetPath.includes("/") && activeModal.currentName.includes("/")) {
                const parent = activeModal.currentName.substring(0, activeModal.currentName.lastIndexOf("/"));
                targetPath = `${parent}/${targetPath}`;
              }
              await runAction(
                zfsApi.renameDataset(activeModal.currentName, targetPath),
                `Renamed ${activeModal.itemType} to ${targetPath}`
              );
            }
            setActiveModal(null);
          }}
        />
      )}

      {activeModal?.type === "destroy" && (
        <DestroyModal
          isOpen={true}
          itemType={activeModal.itemType}
          itemName={activeModal.itemName}
          onClose={() => setActiveModal(null)}
          onConfirm={async (args) => {
            if (activeModal.itemType === "pool") {
              await runAction(zfsApi.destroyPool(activeModal.itemName), `Pool ${activeModal.itemName} destroyed`);
            } else if (activeModal.itemType === "dataset") {
              await runAction(
                zfsApi.destroyDataset(activeModal.itemName, args.recursive),
                `Dataset ${activeModal.itemName} destroyed`
              );
            } else if (activeModal.itemType === "snapshot") {
              await runAction(
                zfsApi.destroySnapshot(activeModal.itemName, args.recursive),
                `Snapshot ${activeModal.itemName} destroyed`
              );
            } else if (activeModal.itemType === "snapshots") {
              for (const s of activeModal.itemName.split(" ")) {
                if (s) await zfsApi.destroySnapshot(s, args.recursive);
              }
              addAlert("success", "Snapshots destroyed");
              await loadData();
            }
            setActiveModal(null);
          }}
        />
      )}

      {activeModal?.type === "attach" && (
        <AttachDiskModal
          isOpen={true}
          poolName={activeModal.poolName}
          existingDevice={activeModal.existingDevice}
          availableDisks={disks.filter((d) => !d.pool)}
          onClose={() => setActiveModal(null)}
          onSubmit={async (args) => {
            await runAction(
              zfsApi.diskAction("attach", args.poolName, args.existingDevice, args.newDevice),
              `Attached ${args.newDevice} to ${args.existingDevice}`
            );
            setActiveModal(null);
          }}
        />
      )}

      {activeModal?.type === "replace" && (
        <ReplaceDiskModal
          isOpen={true}
          poolName={activeModal.poolName}
          oldDevice={activeModal.oldDevice}
          availableDisks={disks.filter((d) => !d.pool)}
          onClose={() => setActiveModal(null)}
          onSubmit={async (args) => {
            await runAction(
              zfsApi.diskAction("replace", args.poolName, args.oldDevice, args.newDevice),
              `Replaced ${args.oldDevice} with ${args.newDevice}`
            );
            setActiveModal(null);
          }}
        />
      )}

      {activeModal?.type === "smart-details" && (
        <SmartDetailsModal
          isOpen={true}
          disk={activeModal.disk}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "preview" && (
        <CommandPreviewModal
          isOpen={true}
          title={activeModal.title}
          command={activeModal.command}
          description={activeModal.description}
          isDestructive={activeModal.isDestructive}
          onConfirm={async () => {
            await activeModal.onConfirm();
            setActiveModal(null);
          }}
          onCancel={() => setActiveModal(null)}
        />
      )}
    </div>
  );
};
