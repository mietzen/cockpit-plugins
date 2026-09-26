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
  mru_size?: number;
  mru_hits?: number;
  mru_ghost_hits?: number;
  mfu_size?: number;
  mfu_hits?: number;
  mfu_ghost_hits?: number;
  p_size?: number;
  data_size?: number;
  metadata_size?: number;
  hdr_size?: number;
  other_size?: number;
  dbuf_size?: number;
  dnode_size?: number;
  bonus_size?: number;
  compressed_size?: number;
  uncompressed_size?: number;
  compression_ratio?: number;
  prefetch_data_hits?: number;
  prefetch_data_misses?: number;
  prefetch_metadata_hits?: number;
  prefetch_metadata_misses?: number;
  l2_size?: number;
  l2_asize?: number;
  l2_hits?: number;
  l2_misses?: number;
  l2_feeds?: number;
  l2_rw_clash?: number;
  l2_cksum_bad?: number;
  l2_io_error?: number;
  memory_throttle_count?: number;
}

export interface SanoidDatasetPolicy {
  dataset: string;
  template?: string;
  hourly?: number;
  daily?: number;
  monthly?: number;
  yearly?: number;
  autosnap?: boolean;
  autoprune?: boolean;
  recursive?: boolean;
  process_children_only?: boolean;
}

export interface SanoidSyncoidInfo {
  installed: boolean;
  sanoid_installed: boolean;
  syncoid_installed: boolean;
  sanoid_timer_active?: boolean;
  sanoid_service_active?: boolean;
  syncoid_timer_active?: boolean;
  syncoid_service_active?: boolean;
  policies: SanoidDatasetPolicy[];
}

export interface SystemInfo {
  kernel_module_loaded: boolean;
  version: string;
  arc?: ArcStats;
  sanoid?: SanoidSyncoidInfo;
}


export interface CommandResult {
  success: boolean;
  returncode: number;
  stdout: string;
  stderr: string;
  command: string;
}

export interface VDevSpec {
  type: "stripe" | "mirror" | "raidz1" | "raidz2" | "raidz3" | "log" | "cache" | "spare" | "special" | "dedup";
  devices: string[];
}

export interface PoolCreateSpec {
  name: string;
  vdevs: VDevSpec[];
  ashift?: number;
  compression?: string;
  altroot?: string;
  mountpoint?: string;
  properties?: Record<string, string>;
  force?: boolean;
}

export interface DatasetCreateSpec {
  path: string;
  type?: "filesystem" | "volume";
  size?: string;
  volblocksize?: string;
  sparse?: boolean;
  properties?: Record<string, string>;
}

export interface SnapshotCreateSpec {
  path: string;
  name: string;
  recursive?: boolean;
}

export interface SnapshotCloneSpec {
  snapshot: string;
  clone_path: string;
  properties?: Record<string, string>;
}

