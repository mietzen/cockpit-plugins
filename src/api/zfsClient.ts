import {
  SystemInfo,
  ZPool,
  ZDataset,
  ZSnapshot,
  DiskDevice,
  CommandResult,
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
      return this.getMockData(subcommand, args);
    }

    const cockpit = (window as any).cockpit;
    const cmd = ["python3", this.helperPath, subcommand, ...args];

    try {
      const output = await cockpit.spawn(cmd, { superuser: "try", err: "message" });
      return JSON.parse(output.trim() || "{}");
    } catch (err: any) {
      // If primary path failed, try fallback
      for (const fallback of HELPER_PATHS) {
        if (fallback === this.helperPath) {
          continue;
        }
        try {
          const fallbackCmd = ["python3", fallback, subcommand, ...args];
          const out = await cockpit.spawn(fallbackCmd, { superuser: "try", err: "message" });
          this.helperPath = fallback;
          return JSON.parse(out.trim() || "{}");
        } catch {
          // continue
        }
      }
      throw new Error(`ZFS Helper failed: ${err.message || err}`);
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

  public async executeCommand(cmdArgs: string[]): Promise<CommandResult> {
    if (!this.hasCockpit()) {
      return {
        success: true,
        returncode: 0,
        stdout: "Command executed (simulated)",
        stderr: "",
        command: cmdArgs.join(" "),
      };
    }

    const cockpit = (window as any).cockpit;
    try {
      const output = await cockpit.spawn(cmdArgs, { superuser: "try", err: "message" });
      return {
        success: true,
        returncode: 0,
        stdout: output,
        stderr: "",
        command: cmdArgs.join(" "),
      };
    } catch (err: any) {
      return {
        success: false,
        returncode: 1,
        stdout: "",
        stderr: err.message || String(err),
        command: cmdArgs.join(" "),
      };
    }
  }

  private getMockData(subcommand: string, _args: string[]): any {
    if (subcommand === "system-info") {
      return {
        kernel_module_loaded: true,
        version: "zfs-2.4.3-2\nzfs-kmod-2.4.3-2",
        arc: {
          size: 4294967296,
          target_size: 8589934592,
          min_size: 1073741824,
          max_size: 17179869184,
          hits: 450000,
          misses: 25000,
          hit_ratio: 0.947,
          data_hits: 300000,
          data_misses: 20000,
          metadata_hits: 150000,
          metadata_misses: 5000,
        },
      };
    }

    if (subcommand === "pools-list") {
      return [
        {
          name: "tank",
          size: 1073741824000,
          alloc: 214748364800,
          free: 858993459200,
          frag: 12,
          cap: 20,
          dedup: 1.25,
          health: "ONLINE",
          guid: "1234567890123456",
          scan: {
            function: "scrub",
            state: "finished",
            percentage: 100,
            raw: "scrub repaired 0B in 00:15:20 with 0 errors on Fri Aug 28 12:00:00 2026",
          },
          vdevs: [
            {
              name: "mirror-0",
              state: "ONLINE",
              read: 0,
              write: 0,
              cksum: 0,
              is_group: true,
              children: [
                { name: "/dev/sdb", state: "ONLINE", read: 0, write: 0, cksum: 0 },
                { name: "/dev/sdc", state: "ONLINE", read: 0, write: 0, cksum: 0 },
              ],
            },
          ],
          cache: [{ name: "/dev/sdd", state: "ONLINE", read: 0, write: 0, cksum: 0 }],
          logs: [{ name: "/dev/sde", state: "ONLINE", read: 0, write: 0, cksum: 0 }],
          spares: [{ name: "/dev/sdf", state: "AVAIL", read: 0, write: 0, cksum: 0 }],
        },
      ];
    }

    if (subcommand === "datasets-list") {
      return [
        {
          name: "tank",
          type: "filesystem",
          used: 214748364800,
          avail: 858993459200,
          refer: 1048576,
          mountpoint: "/tank",
          mounted: true,
          compression: "lz4",
          compressratio: 1.45,
          dedup: "off",
          encryption: "off",
          atime: true,
          sync: "standard",
          quota: 0,
          reservation: 0,
          recordsize: 131072,
          snapshot_count: 3,
        },
      ];
    }

    if (subcommand === "snapshots-list") {
      return [];
    }

    if (subcommand === "disks-list") {
      return [];
    }

    return {};
  }
}

export const zfsApi = new ZfsApiClient();
