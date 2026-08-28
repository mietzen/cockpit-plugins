import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Wizard,
  WizardStep,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  Flex,
  FlexItem,
  Alert,
  Title,
  Card,
  CardBody,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { PlusCircleIcon, TrashIcon, CopyIcon, CheckIcon } from "@patternfly/react-icons";
import { DiskDevice } from "../types";
import { formatBytes } from "../utils/formatters";

interface VDevEntry {
  id: string;
  type: "stripe" | "mirror" | "raidz1" | "raidz2" | "raidz3" | "cache" | "log" | "spare" | "special";
  devices: string[];
}

interface CreatePoolWizardProps {
  isOpen: boolean;
  availableDisks: DiskDevice[];
  onClose: () => void;
  onCreatePool: (args: {
    name: string;
    vdevs: VDevEntry[];
    ashift: number;
    compression: string;
    dedup: string;
    atime: boolean;
    sync: string;
    recordsize: string;
    autoexpand: boolean;
    autoreplace: boolean;
    autotrim: boolean;
    failmode: string;
    altroot?: string;
    mountpoint?: string;
    force: boolean;
    command: string[];
  }) => Promise<void>;
}

export const CreatePoolWizard: React.FC<CreatePoolWizardProps> = ({
  isOpen,
  availableDisks,
  onClose,
  onCreatePool,
}) => {
  // Step 1: Identity
  const [name, setName] = useState("");
  const [ashift, setAshift] = useState("12");
  const [altroot, setAltroot] = useState("");
  const [mountpoint, setMountpoint] = useState("");

  // Step 2: VDevs & Disks
  const [vdevs, setVdevs] = useState<VDevEntry[]>([
    { id: "vdev-0", type: "stripe", devices: [] },
  ]);
  const [force, setForce] = useState(true);

  // Step 3: Pool Properties
  const [autoexpand, setAutoexpand] = useState(true);
  const [autoreplace, setAutoreplace] = useState(false);
  const [autotrim, setAutotrim] = useState(true);
  const [failmode, setFailmode] = useState("wait");

  // Step 4: Filesystem Settings
  const [compression, setCompression] = useState("lz4");
  const [dedup, setDedup] = useState("off");
  const [atime, setAtime] = useState(true);
  const [sync, setSync] = useState("standard");
  const [recordsize, setRecordsize] = useState("128k");

  // Execution
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  if (!isOpen) {
    return null;
  }

  // Generate exact shell command array
  const buildCommand = (): string[] => {
    const cmd: string[] = ["zpool", "create"];
    if (force) {
      cmd.push("-f");
    }

    cmd.push("-o", `ashift=${ashift}`);
    cmd.push("-o", `autoexpand=${autoexpand ? "on" : "off"}`);
    cmd.push("-o", `autoreplace=${autoreplace ? "on" : "off"}`);
    cmd.push("-o", `autotrim=${autotrim ? "on" : "off"}`);
    cmd.push("-o", `failmode=${failmode}`);

    if (altroot.trim()) {
      cmd.push("-R", altroot.trim());
    }
    if (mountpoint.trim()) {
      cmd.push("-m", mountpoint.trim());
    }

    cmd.push("-O", `compression=${compression}`);
    cmd.push("-O", `dedup=${dedup}`);
    cmd.push("-O", `atime=${atime ? "on" : "off"}`);
    cmd.push("-O", `sync=${sync}`);
    cmd.push("-O", `recordsize=${recordsize}`);

    cmd.push(name.trim() || "tank");

    // Add VDev layout
    for (const v of vdevs) {
      if (v.devices.length === 0) continue;
      if (v.type !== "stripe") {
        cmd.push(v.type);
      }
      cmd.push(...v.devices);
    }

    return cmd;
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      setError("Pool name is required");
      return;
    }

    const assignedDisks = vdevs.flatMap((v) => v.devices);
    if (assignedDisks.length === 0) {
      setError("At least one disk must be assigned to a VDev");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cmd = buildCommand();
      await onCreatePool({
        name: name.trim(),
        vdevs,
        ashift: parseInt(ashift, 10),
        compression,
        dedup,
        atime,
        sync,
        recordsize,
        autoexpand,
        autoreplace,
        autotrim,
        failmode,
        altroot: altroot.trim() || undefined,
        mountpoint: mountpoint.trim() || undefined,
        force,
        command: cmd,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const addVDev = (type: VDevEntry["type"]) => {
    setVdevs((prev) => [
      ...prev,
      { id: `vdev-${Date.now()}-${Math.random()}`, type, devices: [] },
    ]);
  };

  const removeVDev = (id: string) => {
    setVdevs((prev) => prev.filter((v) => v.id !== id));
  };

  const toggleDiskInVDev = (vdevId: string, diskPath: string) => {
    setVdevs((prev) =>
      prev.map((v) => {
        if (v.id === vdevId) {
          const exists = v.devices.includes(diskPath);
          return {
            ...v,
            devices: exists
              ? v.devices.filter((d) => d !== diskPath)
              : [...v.devices, diskPath],
          };
        }
        return {
          ...v,
          devices: v.devices.filter((d) => d !== diskPath),
        };
      })
    );
  };

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(buildCommand().join(" "));
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <Modal
      variant={ModalVariant.large}
      isOpen={isOpen}
      onClose={onClose}
      showClose={true}
      title="Create ZFS Storage Pool"
      aria-label="Create ZFS Storage Pool Modal"
      style={{ minHeight: "650px", display: "flex", flexDirection: "column" }}
    >
      <Wizard
        onClose={onClose}
        style={{ height: "100%", minHeight: "520px" }}
      >
        {/* Step 1: Identity & Sector Size */}
        <WizardStep name="Name &amp; Ashift" id="step-1">
          <Form style={{ maxWidth: "600px" }}>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
              Step 1: Pool Name &amp; Base Settings
            </Title>

            <FormGroup label="Pool Name" isRequired fieldId="wizard-pool-name">
              <TextInput
                isRequired
                id="wizard-pool-name"
                value={name}
                onChange={(_event, val) => setName(val)}
                placeholder="e.g. tank, datapool"
                autoFocus
              />
            </FormGroup>

            <FormGroup label="Sector Size (Ashift)" fieldId="wizard-ashift">
              <FormSelect
                id="wizard-ashift"
                value={ashift}
                onChange={(_event, val) => setAshift(val)}
              >
                <FormSelectOption value="12" label="ashift=12 (4 KiB - Standard HDD &amp; NVMe/SSD)" />
                <FormSelectOption value="13" label="ashift=13 (8 KiB - Advanced Flash SSD)" />
                <FormSelectOption value="14" label="ashift=14 (16 KiB - Enterprise Flash)" />
                <FormSelectOption value="9" label="ashift=9 (512 Bytes - Legacy Disk)" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Alternate Root (altroot)" fieldId="wizard-altroot">
              <TextInput
                id="wizard-altroot"
                value={altroot}
                onChange={(_event, val) => setAltroot(val)}
                placeholder="Optional, e.g. /mnt"
              />
            </FormGroup>

            <FormGroup label="Mountpoint" fieldId="wizard-mountpoint">
              <TextInput
                id="wizard-mountpoint"
                value={mountpoint}
                onChange={(_event, val) => setMountpoint(val)}
                placeholder="Default is /<pool_name>"
              />
            </FormGroup>

            <FormGroup fieldId="wizard-force">
              <Checkbox
                id="wizard-force"
                label="Force pool creation (-f, overwrite existing disk labels if necessary)"
                isChecked={force}
                onChange={(_event, checked) => setForce(checked)}
              />
            </FormGroup>
          </Form>
        </WizardStep>

        {/* Step 2: Topology & Disk Selection */}
        <WizardStep name="Disks &amp; VDevs" id="step-2">
          <div>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
              Step 2: Virtual Devices &amp; Disk Layout
            </Title>

            <Flex style={{ marginBottom: "1rem" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("mirror")}>
                  Add Mirror VDev
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("raidz1")}>
                  Add RAID-Z1
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("raidz2")}>
                  Add RAID-Z2
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("cache")}>
                  Add Cache (L2ARC)
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("log")}>
                  Add Log (SLOG)
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("spare")}>
                  Add Spare
                </Button>
              </FlexItem>
            </Flex>

            {vdevs.map((vdev, idx) => (
              <Card key={vdev.id} isPlain style={{ border: "1px solid #333333", marginBottom: "1rem" }}>
                <CardBody>
                  <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} style={{ marginBottom: "0.5rem" }}>
                    <FlexItem>
                      <strong>VDev #{idx + 1} ({vdev.type.toUpperCase()})</strong>
                    </FlexItem>
                    {vdevs.length > 1 && (
                      <FlexItem>
                        <Button
                          variant="plain"
                          icon={<TrashIcon />}
                          onClick={() => removeVDev(vdev.id)}
                          aria-label="Remove VDev"
                        />
                      </FlexItem>
                    )}
                  </Flex>

                  <Table variant="compact">
                    <Thead>
                      <Tr>
                        <Th width={10}>Assign</Th>
                        <Th>Device Path</Th>
                        <Th>Model / Serial</Th>
                        <Th>Capacity</Th>
                        <Th>Type</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {availableDisks.map((disk) => {
                        const isChecked = vdev.devices.includes(disk.path);
                        const isUsedElsewhere =
                          !isChecked && vdevs.some((v) => v.devices.includes(disk.path));

                        return (
                          <Tr key={disk.name}>
                            <Td>
                              <Checkbox
                                id={`check-${vdev.id}-${disk.name}`}
                                isChecked={isChecked}
                                isDisabled={isUsedElsewhere}
                                onChange={() => toggleDiskInVDev(vdev.id, disk.path)}
                              />
                            </Td>
                            <Td>
                              <strong>{disk.path}</strong>
                            </Td>
                            <Td>{disk.model || disk.name}</Td>
                            <Td>{formatBytes(disk.size)}</Td>
                            <Td>{disk.rotational ? "HDD" : "SSD"}</Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            ))}
          </div>
        </WizardStep>

        {/* Step 3: Pool Properties */}
        <WizardStep name="Pool Properties" id="step-3">
          <Form style={{ maxWidth: "600px" }}>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
              Step 3: Pool Properties &amp; Behavior
            </Title>

            <FormGroup fieldId="create-autoexpand">
              <Checkbox
                id="create-autoexpand"
                label="Autoexpand pool capacity when disks are replaced with larger ones"
                isChecked={autoexpand}
                onChange={(_event, checked) => setAutoexpand(checked)}
              />
            </FormGroup>

            <FormGroup fieldId="create-autoreplace">
              <Checkbox
                id="create-autoreplace"
                label="Autoreplace failed devices automatically with hot spares"
                isChecked={autoreplace}
                onChange={(_event, checked) => setAutoreplace(checked)}
              />
            </FormGroup>

            <FormGroup fieldId="create-autotrim">
              <Checkbox
                id="create-autotrim"
                label="Autotrim SSD / NVMe devices in the background"
                isChecked={autotrim}
                onChange={(_event, checked) => setAutotrim(checked)}
              />
            </FormGroup>

            <FormGroup label="Failure Action (failmode)" fieldId="create-failmode">
              <FormSelect
                id="create-failmode"
                value={failmode}
                onChange={(_event, val) => setFailmode(val)}
              >
                <FormSelectOption value="wait" label="wait (Block I/O until device is restored)" />
                <FormSelectOption value="continue" label="continue (Return EIO error to applications)" />
                <FormSelectOption value="panic" label="panic (Reboot system on fatal pool failure)" />
              </FormSelect>
            </FormGroup>
          </Form>
        </WizardStep>

        {/* Step 4: Root Filesystem Settings */}
        <WizardStep name="Filesystem Defaults" id="step-4">
          <Form style={{ maxWidth: "600px" }}>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
              Step 4: Root Filesystem Defaults
            </Title>

            <FormGroup label="Compression" fieldId="create-comp">
              <FormSelect
                id="create-comp"
                value={compression}
                onChange={(_event, val) => setCompression(val)}
              >
                <FormSelectOption value="lz4" label="lz4 (Fast, recommended default)" />
                <FormSelectOption value="zstd" label="zstd (Higher compression ratio)" />
                <FormSelectOption value="gzip" label="gzip (Legacy maximum compression)" />
                <FormSelectOption value="off" label="off (No compression)" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Deduplication" fieldId="create-dedup">
              <FormSelect
                id="create-dedup"
                value={dedup}
                onChange={(_event, val) => setDedup(val)}
              >
                <FormSelectOption value="off" label="off (Recommended unless dedicated RAM available)" />
                <FormSelectOption value="on" label="on" />
                <FormSelectOption value="verify" label="verify (Cryptographic verification)" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Recordsize (Block Size)" fieldId="create-recsize">
              <FormSelect
                id="create-recsize"
                value={recordsize}
                onChange={(_event, val) => setRecordsize(val)}
              >
                <FormSelectOption value="128k" label="128 KiB (Standard default)" />
                <FormSelectOption value="1M" label="1 MiB (Large sequential files &amp; media)" />
                <FormSelectOption value="64k" label="64 KiB" />
                <FormSelectOption value="16k" label="16 KiB (Databases)" />
                <FormSelectOption value="4k" label="4 KiB" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Synchronous I/O (sync)" fieldId="create-sync">
              <FormSelect
                id="create-sync"
                value={sync}
                onChange={(_event, val) => setSync(val)}
              >
                <FormSelectOption value="standard" label="standard" />
                <FormSelectOption value="always" label="always" />
                <FormSelectOption value="disabled" label="disabled" />
              </FormSelect>
            </FormGroup>

            <FormGroup fieldId="create-atime">
              <Checkbox
                id="create-atime"
                label="Update access times on file reads (atime)"
                isChecked={atime}
                onChange={(_event, checked) => setAtime(checked)}
              />
            </FormGroup>
          </Form>
        </WizardStep>

        {/* Step 5: Review & Command Preview */}
        <WizardStep
          name="Review &amp; Create"
          id="step-5"
          footer={{
            isNextDisabled: loading || !name.trim(),
            nextButtonText: loading ? "Creating Pool..." : "Create Pool",
            onNext: handleFinish,
          }}
        >
          <div>
            <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
              Step 5: Review Configuration &amp; Command Preview
            </Title>

            <Card style={{ marginBottom: "1.5rem" }}>
              <CardBody>
                <p style={{ marginBottom: "0.4rem" }}>
                  <strong>Pool Name:</strong> {name || "<required>"}
                </p>
                <p style={{ marginBottom: "0.4rem" }}>
                  <strong>Sector Size (Ashift):</strong> {ashift}
                </p>
                <p style={{ marginBottom: "0.4rem" }}>
                  <strong>VDev Layout:</strong>{" "}
                  {vdevs
                    .map((v) => `${v.type.toUpperCase()}: ${v.devices.length} disk(s)`)
                    .join("; ")}
                </p>
                <p style={{ marginBottom: "0.4rem" }}>
                  <strong>Compression:</strong> {compression}
                </p>
                <p>
                  <strong>Deduplication:</strong> {dedup}
                </p>
              </CardBody>
            </Card>

            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "0.85rem", color: "#a0a0a0", marginBottom: "0.4rem", fontWeight: 600 }}>
                Shell Command Preview:
              </div>
              <div
                style={{
                  position: "relative",
                  backgroundColor: "rgb(15, 15, 15)",
                  border: "1px solid #383838",
                  borderRadius: "8px",
                  padding: "10px 42px 10px 14px",
                  fontFamily: "monospace",
                  fontSize: "0.9rem",
                  color: "#92c5f9",
                  wordBreak: "break-all",
                  lineHeight: "1.4",
                }}
              >
                <span>{buildCommand().join(" ")}</span>
                <button
                  type="button"
                  onClick={handleCopyCmd}
                  title={copiedCmd ? "Copied!" : "Copy command"}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    color: copiedCmd ? "#5ba352" : "#a0a0a0",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                  }}
                >
                  {copiedCmd ? <CheckIcon style={{ fontSize: "14px" }} /> : <CopyIcon style={{ fontSize: "14px" }} />}
                </button>
              </div>
            </div>

            <Flex gap={{ default: "gapMd" }} style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
              <FlexItem>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleFinish}
                  isDisabled={loading || !name.trim()}
                  isLoading={loading}
                  id="wizard-create-pool-btn"
                >
                  {loading ? "Creating Pool..." : "Create Pool Now"}
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" size="lg" onClick={onClose} isDisabled={loading}>
                  Cancel
                </Button>
              </FlexItem>
            </Flex>

            {error && (
              <Alert variant="danger" title="Pool Creation Failed" style={{ marginTop: "1rem" }}>
                {error}
              </Alert>
            )}
          </div>
        </WizardStep>
      </Wizard>
    </Modal>
  );
};
