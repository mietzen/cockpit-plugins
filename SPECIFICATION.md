# cockpit-zfs: Technical Specification & Architecture

## 1. Overview & Architecture

`cockpit-zfs` is an open-source Cockpit plugin providing comprehensive OpenZFS storage management.

```
+-------------------------------------------------------------------+
|                        Cockpit Web Shell                          |
|  +-------------------------------------------------------------+  |
|  |             cockpit-zfs Web UI (React + PatternFly)         |  |
|  |  [Dashboard] [Pools] [Datasets] [Snapshots] [Disks] [Config]|  |
|  +------------------------------+------------------------------+  |
|                                 | cockpit.spawn (JSON IPC)        |
+---------------------------------v---------------------------------+
|                    Python Backend Helper                          |
|             (/usr/libexec/cockpit-zfs/zfs_helper.py)              |
|   +-------------------+-------------------+-------------------+   |
|   |   Zpool Engine    |    Zfs Engine     |    Disk Engine    |   |
|   |  - list/status    |   - list/get/set  |   - lsblk parser  |   |
|   |  - create/destroy |   - create/clone  |   - smartctl info |   |
|   |  - scrub/trim/vdev|   - snapshot/roll |   - wipe/format   |   |
|   +-------------------+-------------------+-------------------+   |
+---------------------------------v---------------------------------+
|                      Host Linux Subsystem                         |
|   [ OpenZFS Kernel Module (kmod) / zpool / zfs / smartctl / lsblk]|
+-------------------------------------------------------------------+
```

---

## 2. Layered Architecture

1. **Presentation Layer (Frontend)**:
   - Framework: React 18, TypeScript, PatternFly 5/6 (`@patternfly/react-core`, `@patternfly/react-table`, `@patternfly/react-icons`).
   - Communication: `cockpit.js` (`cockpit.spawn`, `cockpit.file`).
   - Features: Command preview modal before running destructive/mutating actions, responsive cards and tables, real-time status indicators.

2. **Application / Service Layer (Backend Helper)**:
   - Implementation: Python 3 CLI helper (`/usr/libexec/cockpit-zfs/zfs_helper.py`).
   - Output: Strict JSON data contracts over stdout; structured error codes over stderr.
   - Abstraction: Clean separation between raw CLI execution, output parsing, domain models, and validation.

3. **System / Driver Layer**:
   - Host utilities: `zpool`, `zfs`, `smartctl`, `lsblk`, `wipefs`, `dd`.
   - Kernel interfaces: `/proc/spl/kstat/zfs/arcstats`, `/proc/modules`.

---

## 3. Domain Models & Enums

### 3.1 Core Enums

```python
# Pool Health Status
class ZPoolHealth(str, Enum):
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    FAULTED = "FAULTED"
    OFFLINE = "OFFLINE"
    UNAVAIL = "UNAVAIL"
    SUSPENDED = "SUSPENDED"

# VDev Topology Types
class VDevType(str, Enum):
    DATA = "data"
    MIRROR = "mirror"
    RAIDZ1 = "raidz1"
    RAIDZ2 = "raidz2"
    RAIDZ3 = "raidz3"
    DRAID1 = "draid1"
    DRAID2 = "draid2"
    DRAID3 = "draid3"
    SPECIAL = "special"
    DEDUP = "dedup"
    CACHE = "cache"
    LOG = "log"
    SPARE = "spare"

# Dataset Types
class DatasetType(str, Enum):
    FILESYSTEM = "filesystem"
    VOLUME = "volume"
    SNAPSHOT = "snapshot"
    BOOKMARK = "bookmark"

# Compression Types
class CompressionType(str, Enum):
    ON = "on"
    OFF = "off"
    LZ4 = "lz4"
    GZIP = "gzip"
    ZSTD = "zstd"
    ZLE = "zle"
    LZJB = "lzjb"

# Deduplication Types
class DedupType(str, Enum):
    OFF = "off"
    ON = "on"
    VERIFY = "verify"
    SHA256 = "sha256"
    SKEIN = "skein"
    EDONR = "edonr"
    BLAKE3 = "blake3"

# Encryption Types
class EncryptionType(str, Enum):
    OFF = "off"
    ON = "on"
    AES_128_CCM = "aes-128-ccm"
    AES_128_GCM = "aes-128-gcm"
    AES_192_CCM = "aes-192-ccm"
    AES_192_GCM = "aes-192-gcm"
    AES_256_CCM = "aes-256-ccm"
    AES_256_GCM = "aes-256-gcm"

# Scrub / Trim Modes
class ScrubAction(str, Enum):
    START = "start"
    STOP = "stop"
    PAUSE = "pause"

class TrimAction(str, Enum):
    START = "start"
    STOP = "stop"
    SUSPEND = "suspend"
```

### 3.2 Data Entities

```typescript
// ZFS Pool
interface ZPool {
  name: string;
  guid: string;
  health: ZPoolHealth;
  size: number;
  alloc: number;
  free: number;
  fragmentation: number;
  dedupratio: number;
  altroot?: string;
  autoexpand: boolean;
  autoreplace: boolean;
  autotrim: boolean;
  ashift: number;
  comment?: string;
  scan: PoolScanStatus;
  trim: PoolTrimStatus;
  vdevs: VDevTree;
}

// Dataset (Filesystem or ZVol)
interface ZDataset {
  name: string;
  pool: string;
  type: DatasetType;
  used: number;
  available: number;
  referenced: number;
  mountpoint?: string;
  mounted: boolean;
  compression: string;
  compressratio: number;
  dedup: string;
  encryption: string;
  keyLoaded?: boolean;
  atime: boolean;
  sync: string;
  quota: number;
  reservation: number;
  recordsize?: number;
  volsize?: number;
  volblocksize?: number;
  origin?: string;
  snapshotCount: number;
}

// Snapshot
interface ZSnapshot {
  name: string;
  dataset: string;
  pool: string;
  creation: string;
  used: number;
  referenced: number;
  clones: string[];
}

// Disk Device & SMART
interface DiskDevice {
  path: string;
  name: string;
  size: number;
  model: string;
  serial: string;
  wwn?: string;
  transport: string; // sata, nvme, sas, usb, ata
  rotational: boolean;
  rotationRate?: number;
  smartHealth: "PASSED" | "FAILED" | "UNKNOWN";
  temperature?: number;
  pool?: string;
  partitions: DiskPartition[];
}

// ARC Cache Stats
interface ArcStats {
  size: number;
  targetSize: number;
  minSize: number;
  maxSize: number;
  hitRatio: number;
  dataHits: number;
  dataMisses: number;
  mruHits: number;
  mfuHits: number;
}
```

---

## 4. UI Specification & Workflows

### 4.1 Navigation
- **Dashboard**: Storage utilization, pool status cards, ARC cache stats, ZFS version, system health alerts.
- **Pools**: List of all pools with capacity bars, scrub status, and pool-level action dropdowns.
  - Sub-views per pool:
    - **Topology**: Visual hierarchical tree of data, special, cache, log, spare VDevs and disk health.
    - **Datasets**: Nested tree table of datasets and ZVols.
    - **Snapshots**: Searchable snapshot table with filters and bulk actions.
    - **Maintenance**: Scrub and trim controls, scan progress, history.
    - **Settings**: Pool properties (`autoexpand`, `autoreplace`, `autotrim`, `failmode`, `comment`).
- **Disks**: Host disk inventory, SMART attributes, self-tests, disk wiping/formatting.
- **Settings**: Appearance (Auto / Light / Dark), compatibility mode, and command preview preferences.

### 4.2 Modal Wizards & Actions

1. **Create Pool Wizard (5 Steps)**:
   - *Step 1: Identity*: Pool name, Ashift (Auto, 9=512B, 12=4KB, 13=8KB), Altroot, Mountpoint.
   - *Step 2: VDevs & Disks*: Data VDevs (Stripe, Mirror, RAID-Z1/Z2/Z3, dRAID), Special/Metadata VDevs, Cache (L2ARC), Log (SLOG), Spares. Force flag.
   - *Step 3: Pool Properties*: Autoexpand, Autoreplace, Autotrim, Failmode.
   - *Step 4: Root Dataset Defaults*: Compression, Deduplication, Atime, Sync, Recordsize.
   - *Step 5: Review & Preview*: Full breakdown and exact `zpool create` command preview.

2. **Dataset Actions**:
   - *Create Dataset*: Name, Compression (lz4, zstd, gzip, off), Deduplication, Encryption (Passphrase, Key file, Hex), Quota, Reservation, Recordsize, Mountpoint.
   - *Create ZVol*: Name, Volume Size, Volblocksize (8k, 16k, 32k, 64k, 128k), Thin Provisioning (Sparse ZVol), Compression, Deduplication.
   - *Edit Properties*: Live update of dataset properties with inherit toggle.
   - *Mount / Unmount*: Toggle mounted state.
   - *Destroy Dataset*: Recursive (`-r`) and force (`-f`) checkboxes with name confirmation.
   - *Rename Dataset*: Target path renaming.

3. **Snapshot Actions**:
   - *Create Snapshot*: Target dataset, snapshot name (or timestamp generator), recursive toggle.
   - *Rollback*: Rollback dataset to chosen snapshot (with `-r` destroy intermediate snapshots flag).
   - *Clone Snapshot*: Create new writable dataset from snapshot.
   - *Destroy Snapshot*: Single or bulk deletion.
   - *Rename Snapshot*: Rename snapshot suffix.

4. **Disk & VDev Actions**:
   - *Attach Disk*: Attach disk to existing single-disk or mirror VDev.
   - *Detach Disk*: Detach mirror leg.
   - *Offline / Online*: Change device state.
   - *Replace Disk*: Replace faulty drive with selected spare/new drive.
   - *Clear Errors*: Reset pool error counters (`zpool clear`).
   - *SMART Self-Test*: Trigger Short or Extended self-test on disk.
   - *Wipe Disk*: Clear filesystem signatures (`wipefs -a`).

5. **Command Preview Modal**:
   - Every mutating action provides a "Preview Command" section displaying the exact shell command that will execute, with a one-click copy button.

---

## 5. Shell Command Mapping

| Action | Generated Shell Command |
|---|---|
| List Pools | `zpool list -p -H -o name,size,alloc,free,frag,cap,dedup,health,altroot,guid` |
| Pool Status | `zpool status -p -P <pool>` |
| Get Pool Properties | `zpool get all -p -H <pool>` |
| Set Pool Property | `zpool set <property>=<value> <pool>` |
| Create Pool | `zpool create -o ashift=<ashift> -O compression=<comp> <pool> <vdev_spec...>` |
| Destroy Pool | `zpool destroy -f <pool>` |
| Export Pool | `zpool export <pool>` |
| Import Pool | `zpool import -d /dev/disk/by-id -f <pool>` |
| Scrub Action | `zpool scrub [-s|-p] <pool>` |
| Trim Action | `zpool trim [-c|-d] <pool> [device]` |
| Attach Device | `zpool attach <pool> <existing_device> <new_device>` |
| Detach Device | `zpool detach <pool> <device>` |
| Offline Device | `zpool offline <pool> <device>` |
| Online Device | `zpool online <pool> <device>` |
| Replace Device | `zpool replace <pool> <old_device> <new_device>` |
| List Datasets | `zfs list -p -H -t filesystem,volume -o name,type,used,avail,refer,mountpoint,mounted,compression,compressratio,dedup,encryption,keystatus,atime,sync,quota,reservation,recordsize,volsize,volblocksize,origin` |
| List Snapshots | `zfs list -p -H -t snapshot -o name,creation,used,refer,clones` |
| Create Dataset | `zfs create -o compression=<comp> -o recordsize=<rec> <path>` |
| Create ZVol | `zfs create -s -V <size> -b <blocksize> -o compression=<comp> <path>` |
| Destroy Dataset | `zfs destroy [-r] [-f] <path>` |
| Create Snapshot | `zfs snapshot [-r] <path>@<snap>` |
| Rollback Snapshot| `zfs rollback [-r] [-f] <path>@<snap>` |
| Clone Snapshot | `zfs clone -o <props> <path>@<snap> <new_path>` |
| Rename | `zfs rename <old_path> <new_path>` |
| Mount / Unmount | `zfs mount <path>` / `zfs unmount [-f] <path>` |
| Disk Inventory | `lsblk -J -b -o NAME,KNAME,PATH,SIZE,ROTA,TYPE,TRAN,SERIAL,WWN,MODEL,MOUNTPOINT,FSTYPE,UUID` |
| SMART Health | `smartctl -j -H -A -i /dev/<disk>` |

---

## 6. Build, Packaging & Deployment

- **Plugin Directory**: `/usr/share/cockpit/zfs-storage`
- **Manifest**: `manifest.json` declaring Cockpit menu entry and CSP.
- **Backend Binary / Script**: `/usr/libexec/cockpit-zfs/zfs_helper.py`
- **Package Type**: Debian package (`.deb`) and RPM package (`.rpm`) for easy distribution across Linux distributions.
