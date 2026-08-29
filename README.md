# Cockpit ZFS Storage

A modern, fast, and feature-rich **ZFS Storage Manager** plugin for [Cockpit](https://cockpit-project.org/). Manage ZFS pools, datasets, zvols, snapshots, scrubs, trims, and SMART disk health directly from Cockpit with PatternFly v5 design and zero flicker.

---

## 📸 Screenshots

### Overview & Dashboard
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Overview Light](docs/screenshots/01-overview-light.png) | ![Overview Dark](docs/screenshots/01-overview-dark.png) |

### Storage Pools
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Pools Light](docs/screenshots/02-pools-light.png) | ![Pools Dark](docs/screenshots/02-pools-dark.png) |

### Pool Topology & Devices
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Topology Light](docs/screenshots/03-pool-topology-light.png) | ![Topology Dark](docs/screenshots/03-pool-topology-dark.png) |

### Datasets & Volumes (ZFS zvols)
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Datasets Light](docs/screenshots/04-pool-datasets-light.png) | ![Datasets Dark](docs/screenshots/04-pool-datasets-dark.png) |

### Snapshots Tree & Focus
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Snapshots Light](docs/screenshots/05-pool-snapshots-light.png) | ![Snapshots Dark](docs/screenshots/05-pool-snapshots-dark.png) |

### Pool Maintenance (Scrub & Trim)
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Maintenance Light](docs/screenshots/06-pool-maintenance-light.png) | ![Maintenance Dark](docs/screenshots/06-pool-maintenance-dark.png) |

### Physical Disks & SMART Health
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Disks Light](docs/screenshots/07-disks-smart-light.png) | ![Disks Dark](docs/screenshots/07-disks-smart-dark.png) |

### Create Pool Wizard
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Create Pool Light](docs/screenshots/08-create-pool-modal-light.png) | ![Create Pool Dark](docs/screenshots/08-create-pool-modal-dark.png) |

---

## ✨ Features

- **Storage Pool Management**:
  - Multi-step Pool Creation Wizard with support for Stripe, Mirror, RAIDZ1, RAIDZ2, RAIDZ3, and dRAID configurations.
  - Dedicated VDEV roles: Data, Log (SLOG), Cache (L2ARC), and Special (Metadata).
  - Pool import scan with automatic discovery and force import options.
  - Export and destroy pools with verification safeguards.
  - Real-time pool health, capacity, fragmentation, and deduplication stats.

- **Datasets & Volumes (zvols)**:
  - Create and manage filesystems and block volumes (zvols).
  - Nested hierarchical dataset tree representation.
  - Full property editor: Compression (`lz4`, `zstd`, `gzip`), deduplication, quotas, record sizes, atime, and mountpoints.
  - Mount, unmount, rename, and delete actions.

- **Snapshots & Clones**:
  - Hierarchical snapshot tree with dataset target selection.
  - Automatic focus, uncollapse, and scroll-to-dataset from dataset badges.
  - Rollback, clone, rename, and bulk snapshot destruction.

- **Pool Maintenance**:
  - Live progress monitoring for scrubs and trims.
  - Start, pause, resume, and cancel scrubs and trims.
  - Clean status alerts for verification and error reports.

- **Disks & SMART Monitoring**:
  - Detailed disk enumeration across NVMe, SATA, SAS, and SCSI.
  - Integrated SMART health status, temperature, serial numbers, and model information.
  - Disk offline, online, replace, and attach actions.

- **Design & Performance**:
  - Built with **PatternFly v5** and seamless Cockpit Dark / Light mode auto-sync.
  - Pure in-memory view routing for **instant 0ms redraw and zero flicker**.
  - Safe shell command preview modal for destructive operations.

---

## 🛠️ Architecture

- **Frontend**: React 18, TypeScript, Vite, PatternFly v5.
- **Bridge**: Pure Cockpit JavaScript API bridge (`cockpit.spawn`).
- **Backend Helper**: Python 3 executable helper (`zfs_helper.py`) executing native `zpool`, `zfs`, `lsblk`, `smartctl`, and `kstat` / `/proc/spl/kstat/zfs/arcstats`.
- **System Package**: Deploys as a standard Cockpit package into `/usr/share/cockpit/zfs-storage` and `/usr/libexec/cockpit-zfs`.

---

## 🚀 Installation & Deployment

### Requirements
- Linux (Debian 12+, Ubuntu 22.04+, RHEL/Fedora/Rocky 9+)
- `cockpit`
- `zfsutils-linux` or `zfs` OpenZFS packages
- `smartmontools` (for SMART drive health)
- Node.js 18+ & npm (for building from source)

### Building from Source

```bash
# Clone the repository
git clone https://github.com/mietzen/cockpit-zfs.git
cd cockpit-zfs

# Install dependencies
npm install

# Build package
make build
```

### Local Installation

```bash
sudo make install
```

### Remote Deployment to Test Server / VM

```bash
make deploy TARGET=user@192.168.1.100
```

---

## 📄 License

MIT License. Developed for the OpenZFS and Cockpit community.
