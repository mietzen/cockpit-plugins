import {
  SystemInfo,
  ZPool,
  ZDataset,
  ZSnapshot,
  DiskDevice,
  CommandResult,
  PoolCreateSpec,
  DatasetCreateSpec,
  SnapshotCreateSpec,
  SnapshotCloneSpec,
} from "../types";

const HELPER_PATHS = [
  "/usr/libexec/cockpit-zfs/zfs_helper.py",
  "/usr/share/cockpit/zfs-storage/backend/zfs_helper.py",
  "/tmp/cockpit-zfs-backend/zfs_helper.py",
];

export class ZfsApiClient {
  private helperPath = "/usr/libexec/cockpit-zfs/zfs_helper.py";

  private hasCockpit(): boolean {
    return typeof window !== "undefined" && !!(window as any).cockpit?.spawn;
  }

  private async runHelper(subcommand: string, ...args: string[]): Promise<any> {
    if (!this.hasCockpit()) {
      return { success: true, returncode: 0, stdout: "", stderr: "" };
    }

    const cockpit = (window as any).cockpit;
    const cmd = ["python3", this.helperPath, subcommand, ...args];

    try {
      const output = await cockpit.spawn(cmd, { superuser: "require", err: "message" });
      const parsed = JSON.parse(output.trim() || "{}");
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      return parsed;
    } catch (err: any) {
      for (const fallback of HELPER_PATHS) {
        if (fallback === this.helperPath) {
          continue;
        }
        try {
          const fallbackCmd = ["python3", fallback, subcommand, ...args];
          const out = await cockpit.spawn(fallbackCmd, { superuser: "require", err: "message" });
          this.helperPath = fallback;
          const parsed = JSON.parse(out.trim() || "{}");
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          return parsed;
        } catch {
          // continue fallback search
        }
      }
      throw new Error(`ZFS Helper failed [${subcommand}]: ${err.message || err}`);
    }
  }

  public async getSystemInfo(): Promise<SystemInfo> {
    return this.runHelper("system-info");
  }

  public async getPools(): Promise<ZPool[]> {
    return this.runHelper("pools-list");
  }

  public async getPoolStatus(poolName: string): Promise<any> {
    return this.runHelper("pool-status", poolName);
  }

  public async getPoolProperties(poolName: string): Promise<Record<string, string>> {
    return this.runHelper("pool-properties", poolName);
  }

  public async getDatasets(poolName?: string): Promise<ZDataset[]> {
    return this.runHelper("datasets-list", ...(poolName ? [poolName] : []));
  }

  public async getSnapshots(path?: string): Promise<ZSnapshot[]> {
    return this.runHelper("snapshots-list", ...(path ? [path] : []));
  }

  public async getDisks(): Promise<DiskDevice[]> {
    return this.runHelper("disks-list");
  }

  public async createPool(payload: PoolCreateSpec): Promise<CommandResult> {
    return this.runHelper("pool-create", JSON.stringify(payload));
  }

  public async destroyPool(poolName: string): Promise<CommandResult> {
    return this.runHelper("pool-destroy", poolName);
  }

  public async exportPool(poolName: string): Promise<CommandResult> {
    return this.runHelper("pool-export", poolName);
  }

  public async importPool(payload: { name?: string; force?: boolean; altroot?: string } = {}): Promise<CommandResult> {
    return this.runHelper("pool-import", JSON.stringify(payload));
  }

  public async scrubPool(poolName: string, action: "start" | "pause" | "stop"): Promise<CommandResult> {
    return this.runHelper("pool-scrub", poolName, action);
  }

  public async trimPool(poolName: string, action: "start" | "suspend" | "stop", device?: string): Promise<CommandResult> {
    return this.runHelper("pool-trim", poolName, action, ...(device ? [device] : []));
  }

  public async clearPool(poolName: string, device?: string): Promise<CommandResult> {
    return this.runHelper("pool-clear", poolName, ...(device ? [device] : []));
  }

  public async setPoolProperty(poolName: string, prop: string, value: string): Promise<CommandResult> {
    return this.runHelper("pool-set-property", poolName, prop, value);
  }

  public async createDataset(payload: DatasetCreateSpec): Promise<CommandResult> {
    return this.runHelper("dataset-create", JSON.stringify(payload));
  }

  public async destroyDataset(path: string, recursive: boolean = true): Promise<CommandResult> {
    return this.runHelper("dataset-destroy", path, String(recursive));
  }

  public async renameDataset(oldPath: string, newPath: string): Promise<CommandResult> {
    return this.runHelper("dataset-rename", oldPath, newPath);
  }

  public async mountDataset(path: string): Promise<CommandResult> {
    return this.runHelper("dataset-mount", path);
  }

  public async unmountDataset(path: string, force: boolean = false): Promise<CommandResult> {
    return this.runHelper("dataset-unmount", path, String(force));
  }

  public async setDatasetProperty(path: string, prop: string, value: string): Promise<CommandResult> {
    return this.runHelper("dataset-set-property", path, prop, value);
  }

  public async inheritDatasetProperty(path: string, prop: string): Promise<CommandResult> {
    return this.runHelper("dataset-inherit-property", path, prop);
  }

  public async createSnapshot(payload: SnapshotCreateSpec): Promise<CommandResult> {
    return this.runHelper("snapshot-create", JSON.stringify(payload));
  }

  public async destroySnapshot(path: string, recursive: boolean = false): Promise<CommandResult> {
    return this.runHelper("snapshot-destroy", path, String(recursive));
  }

  public async rollbackSnapshot(path: string, destroyIntermediate: boolean = true): Promise<CommandResult> {
    return this.runHelper("snapshot-rollback", path, String(destroyIntermediate));
  }

  public async cloneSnapshot(payload: SnapshotCloneSpec): Promise<CommandResult> {
    return this.runHelper("snapshot-clone", JSON.stringify(payload));
  }

  public async diskAction(action: string, pool: string, device: string, newDevice?: string): Promise<CommandResult> {
    return this.runHelper("disk-action", action, pool, device, ...(newDevice ? [newDevice] : []));
  }

  public async probeSharingServices(): Promise<{ smb: boolean; nfs: boolean }> {
    try {
      return await this.runHelper("probe-sharing-services");
    } catch {
      return { smb: false, nfs: false };
    }
  }

  public async shareDataset(params: { path: string; smb: boolean; nfs: boolean }): Promise<void> {
    if (!this.hasCockpit()) return;
    const cockpit = (window as any).cockpit;
    const helper = "/usr/libexec/cockpit-file-sharing/file_sharing_helper.py";

    if (params.smb) {
      const shareName = params.path.split("/").pop() || "share";
      const smbData = JSON.stringify({
        name: shareName,
        path: params.path,
        comment: `ZFS share ${params.path}`,
        read_only: false,
        browseable: true,
        guest_ok: false
      });
      await cockpit.spawn(["python3", helper, "save_smb_share", "--data", smbData], { superuser: "require" });
    }

    if (params.nfs) {
      const nfsData = JSON.stringify({
        path: params.path,
        clients: [{ host: "*", read_only: false, sync: true, root_squash: true, no_subtree_check: true }]
      });
      await cockpit.spawn(["python3", helper, "save_nfs_export", "--data", nfsData], { superuser: "require" });
    }
  }
}

export const zfsApi = new ZfsApiClient();

if (typeof window !== "undefined") {
  (window as any).zfsApi = zfsApi;
}
