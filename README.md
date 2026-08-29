# Cockpit Plugins

[![Main Workflow](https://github.com/mietzen/cockpit-plugins/actions/workflows/main.yml/badge.svg)](https://github.com/mietzen/cockpit-plugins/actions/workflows/main.yml)
[![APT Repository](https://img.shields.io/badge/APT-Repository-blue?logo=debian)](https://mietzen.github.io/cockpit-plugins/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PatternFly](https://img.shields.io/badge/UI-PatternFly%20v5-red)](https://www.patternfly.org/)
[![OpenZFS](https://img.shields.io/badge/ZFS-OpenZFS%202.x-orange)](https://openzfs.org/)

A collection of modern, production-grade plugins and extensions for [Cockpit](https://cockpit-project.org/) server administration.

---

## 📦 Available Plugins

| Plugin | Package Name | Description | Status |
| :--- | :--- | :--- | :--- |
| [**ZFS Storage**](zfs-storage/) | `cockpit-zfs-storage` | Complete OpenZFS storage manager with pool creation wizards, dataset/zvol trees, snapshots, scrubs, trims, and SMART health monitoring. | **Stable** |

---

## 🚀 Quick Install (APT Repository)

Install and automatically receive updates directly via APT on Debian, Ubuntu, and Proxmox systems:

```shell
# 1. Add Cockpit Plugins APT repository
echo "deb [trusted=yes] https://mietzen.github.io/cockpit-plugins/ stable main" | sudo tee /etc/apt/sources.list.d/cockpit-plugins.list

# 2. Update package cache
sudo apt update

# 3. Install ZFS Storage plugin
sudo apt install cockpit-zfs-storage
```

---

## 📸 Screenshots (ZFS Storage Plugin)

### Overview & Dashboard
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Overview Light](docs/screenshots/01-overview-light.png) | ![Overview Dark](docs/screenshots/01-overview-dark.png) |

### Storage Pools
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Pools Light](docs/screenshots/02-pools-light.png) | ![Pools Dark](docs/screenshots/02-pools-dark.png) |

### Pool Topology & Physical Devices
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Topology Light](docs/screenshots/03-pool-topology-light.png) | ![Topology Dark](docs/screenshots/03-pool-topology-dark.png) |

### Datasets & Volumes (ZFS zvols)
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Datasets Light](docs/screenshots/04-pool-datasets-light.png) | ![Datasets Dark](docs/screenshots/04-pool-datasets-dark.png) |

### Snapshots Tree & Target Focus
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Snapshots Light](docs/screenshots/05-pool-snapshots-light.png) | ![Snapshots Dark](docs/screenshots/05-pool-snapshots-dark.png) |

### Pool Maintenance (Scrub & Trim)
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Maintenance Light](docs/screenshots/06-pool-maintenance-light.png) | ![Maintenance Dark](docs/screenshots/06-pool-maintenance-dark.png) |

### Disks & SMART Health
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Disks Light](docs/screenshots/07-disks-smart-light.png) | ![Disks Dark](docs/screenshots/07-disks-smart-dark.png) |

### Create Pool Wizard
| Light Theme | Dark Theme |
| :---: | :---: |
| ![Create Pool Light](docs/screenshots/08-create-pool-modal-light.png) | ![Create Pool Dark](docs/screenshots/08-create-pool-modal-dark.png) |

---

## ✨ Features (ZFS Storage)

- **Pool Management**:
  - Multi-step Pool Wizard with Stripe, Mirror, RAIDZ1/2/3, and dRAID configurations.
  - Dedicated VDEV roles for Data, Log (SLOG), Cache (L2ARC), and Special (Metadata).
  - Pool import scan with automatic discovery and force import options.
  - Safe pool export and destroy with typed confirmation safeguards.

- **Datasets & zvols**:
  - Full filesystem and block volume (zvol) creation and management.
  - Hierarchical nested dataset tree.
  - Real-time property editing (Compression `lz4`/`zstd`, Quotas, Deduplication, Record sizes, Mountpoints).
  - Mount, unmount, rename, and delete actions.

- **Snapshots & Clones**:
  - Dataset-specific snapshot creation with target selectors.
  - Clickable snapshot badges in Datasets tab that uncollapse and focus target snapshots.
  - Rollback, clone, rename, and bulk snapshot destruction.

- **Maintenance**:
  - Real-time progress monitoring for scrubs and trims.
  - Start, pause, resume, and cancel verification operations.

- **Disks & SMART**:
  - Comprehensive drive enumeration with model, serial, temperature, and SMART health.
  - Disk offline, online, replace, and attach actions.

- **Performance & Theming**:
  - Built with **PatternFly v5** and synchronized with Cockpit Dark / Light shell theme.
  - Pure in-memory view routing for **true 0ms redraw and zero iframe flicker**.

---

## 🛠️ Building From Source

```shell
# Clone repository
git clone https://github.com/mietzen/cockpit-plugins.git
cd cockpit-plugins

# Build all plugins
make build

# Build Debian packages (.deb)
make deb

# Install locally
sudo make install
```

### Remote Deployment

Deploy directly to a remote test machine over SSH:

```shell
make deploy TARGET=user@192.168.1.100
```

---

## 🧪 End-to-End Testing

The repository includes a comprehensive Playwright test suite that tests live Cockpit and OpenZFS on Ubuntu runners:

```shell
# Setup virtual test disks and user
sudo bash e2e/setup_test_env.sh

# Run Playwright test suite
make e2e
```

---

## 📄 License

MIT License. Developed for the OpenZFS and Cockpit community.
