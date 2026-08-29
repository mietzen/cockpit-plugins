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
import { PlusCircleIcon, TrashIcon } from "@patternfly/react-icons";
import { DiskDevice } from "../types";
import { formatBytes } from "../utils/formatters";
import { CommandBox } from "./CommandBox";

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

    if (autoexpand) cmd.push("-o", "autoexpand=on");
    if (autoreplace) cmd.push("-o", "autoreplace=on");
    if (autotrim) cmd.push("-o", "autotrim=on");
    if (failmode && failmode !== "wait") cmd.push("-o", `failmode=${failmode}`);
    if (altroot.trim()) cmd.push("-R", altroot.trim());

    if (compression && compression !== "off") cmd.push("-O", `compression=${compression}`);
    if (dedup && dedup !== "off") cmd.push("-O", `dedup=${dedup}`);
    if (!atime) cmd.push("-O", "atime=off");
    if (sync && sync !== "standard") cmd.push("-O", `sync=${sync}`);
    if (recordsize && recordsize !== "128k") cmd.push("-O", `recordsize=${recordsize}`);
    if (mountpoint.trim()) cmd.push("-m", mountpoint.trim());

    cmd.push(name.trim() || "<pool_name>");

    for (const vdev of vdevs) {
      if (vdev.type !== "stripe") {
        cmd.push(vdev.type);
      }
      for (const dev of vdev.devices) {
        cmd.push(dev);
      }
    }

    return cmd;
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      setError("Pool name is required");
      return;
    }

    const totalDisks = vdevs.reduce((acc, v) => acc + v.devices.length, 0);
    if (totalDisks === 0) {
      setError("Please select at least one disk device to create the pool");
      return;
    }

    setLoading(true);
    setError(null);
    try {
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
        command: buildCommand(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const addVDev = (type: VDevEntry["type"]) => {
    const newId = `vdev-${Date.now()}`;
    setVdevs([...vdevs, { id: newId, type, devices: [] }]);
  };

  const removeVDev = (id: string) => {
    if (vdevs.length <= 1) return;
    setVdevs(vdevs.filter((v) => v.id !== id));
  };

  const toggleDiskInVDev = (vdevId: string, diskPath: string) => {
    setVdevs(
      vdevs.map((v) => {
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

  return (
    <Modal
      variant={ModalVariant.large}
      isOpen={isOpen}
      onClose={onClose}
      showClose={true}
      hasNoBodyPadding
      aria-label="Create ZFS Storage Pool Modal"
      style={{ minHeight: "600px" }}
    >
      <Wizard
        title="Create ZFS Storage Pool"
        onClose={onClose}
        style={{ height: "100%", minHeight: "560px", border: "none" }}
        footer={(activeStep, onNext, onBack) => {
          const isLastStep =
            activeStep.id === "step-5" ||
            activeStep.index === 5 ||
            (typeof activeStep.id === "string" && activeStep.id.includes("5")) ||
            (typeof activeStep.name === "string" && activeStep.name.includes("Review"));

          const isFirstStep =
            activeStep.id === "step-1" ||
            activeStep.index === 1 ||
            (typeof activeStep.id === "string" && activeStep.id.includes("1"));

          const handleNextClick = () => {
            if (isFirstStep && !name.trim()) {
              setError("Pool name is required");
              return;
            }
            setError(null);
            if (isLastStep) {
              handleFinish();
            } else {
              onNext();
            }
          };

          return (
            <div
              className="pf-v5-c-wizard__footer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--zfs-card-border)",
                backgroundColor: "var(--zfs-card-bg)",
                boxShadow: "none",
              }}
            >
              <Button
                variant="secondary"
                onClick={onBack}
                isDisabled={isFirstStep || loading}
                style={{ width: "90px" }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                onClick={handleNextClick}
                isDisabled={loading}
                isLoading={loading}
                style={{ width: "90px" }}
              >
                {isLastStep ? (loading ? "Creating..." : "Create") : "Next"}
              </Button>
              <Button
                variant="secondary"
                onClick={onClose}
                isDisabled={loading}
                style={{ width: "90px" }}
              >
                Cancel
              </Button>
            </div>
          );
        }}
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
              <Card key={vdev.id} isPlain style={{ border: "1px solid var(--zfs-card-border)", marginBottom: "1rem" }}>
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
                <FormSelectOption value="lz4" label="lz4 (Fast &amp; Recommended)" />
                <FormSelectOption value="zstd" label="zstd (High compression)" />
                <FormSelectOption value="gzip" label="gzip (Maximum compression)" />
                <FormSelectOption value="off" label="off (No compression)" />
              </FormSelect>
            </FormGroup>

            <FormGroup label="Deduplication" fieldId="create-dedup">
              <FormSelect
                id="create-dedup"
                value={dedup}
                onChange={(_event, val) => setDedup(val)}
              >
                <FormSelectOption value="off" label="off (Recommended unless >= 5 GB RAM / TB)" />
                <FormSelectOption value="on" label="on (SHA256)" />
                <FormSelectOption value="verify" label="verify (SHA256 with bitwise verification)" />
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
        <WizardStep name="Review &amp; Create" id="step-5">
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

            <CommandBox command={buildCommand().join(" ")} label="Shell Command Preview:" />

            {error && (
              <Alert variant="danger" isInline title="Failed to create pool" style={{ marginTop: "1rem" }}>
                {error}
              </Alert>
            )}
          </div>
        </WizardStep>
      </Wizard>
    </Modal>
  );
};
