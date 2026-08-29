export type ZPoolHealth = "ONLINE" | "DEGRADED" | "FAULTED" | "OFFLINE" | "UNAVAIL" | "SUSPENDED";

export interface ScanStatus {
  function: "scrub" | "resilver" | "none" | string;
  state: "in_progress" | "finished" | "none" | string;
  percentage: number;
  raw: string;
}

export interface VDevItem {
  name: string;
  state: string;
  read: number;
  write: number;
  cksum: number;
  is_group?: boolean;
  children?: VDevItem[];
}

export interface ZPool {
  name: string;
  size: number;
  alloc: number;
  free: number;
  frag: number;
  cap: number;
  dedup: number;
  health: ZPoolHealth;
  altroot?: string | null;
  guid?: string;
  scan?: ScanStatus;
  vdevs?: VDevItem[];
  cache?: VDevItem[];
  logs?: VDevItem[];
  spares?: VDevItem[];
  special?: VDevItem[];
  dedup_vdevs?: VDevItem[];
}

export interface ZDataset {
  name: string;
  type: "filesystem" | "volume";
  used: number;
  avail: number;
  refer: number;
  mountpoint?: string | null;
  mounted: boolean;
  compression: string;
  compressratio: number;
  dedup: string;
  encryption: string;
  keystatus?: string;
  atime: boolean;
  sync: string;
  quota: number;
  reservation: number;
  recordsize: number;
  volsize?: number | null;
  volblocksize?: number | null;
  origin?: string | null;
  snapshot_count: number;
}

export interface ZSnapshot {
  name: string;
  dataset: string;
  snapshot_name: string;
  creation: number;
  used: number;
  refer: number;
  clones: string[];
}

export interface DiskPartition {
  name: string;
  kname: string;
  path: string;
  size: number;
  mountpoint?: string | null;
  fstype?: string | null;
}

export interface DiskDevice {
  name: string;
  path: string;
  size: number;
  model: string;
  serial: string;
  wwn: string;
  transport: string;
  rotational: boolean;
  smart_health: "PASSED" | "FAILED" | "UNKNOWN";
  temperature?: number | null;
  pool?: string | null;
  partitions: DiskPartition[];
}

export interface ArcStats {
  size: number;
  target_size: number;
  min_size: number;
  max_size: number;
  hits: number;
  misses: number;
  hit_ratio: number;
  data_hits: number;
  data_misses: number;
  metadata_hits: number;
  metadata_misses: number;
}

export interface SystemInfo {
  kernel_module_loaded: boolean;
  version: string;
  arc?: ArcStats;
}

export interface CommandResult {
  success: boolean;
  returncode: number;
  stdout: string;
  stderr: string;
  command: string;
}
