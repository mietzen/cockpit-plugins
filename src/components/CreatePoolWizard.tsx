import React, { useState } from "react";
import {
  Wizard,
  WizardStep,
  WizardFooterWrapper,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  Badge,
  Flex,
  FlexItem,
  Alert,
  ClipboardCopy,
  Title,
  Card,
  CardBody,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { PlusCircleIcon, TrashIcon } from "@patternfly/react-icons";
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

  if (!isOpen) {
    return null;
  }

  // Generate exact shell command array
  const buildCommand = (): string[] => {
    const cmd: string[] = ["zpool", "create"];
    if (force) {
      cmd.push("-f");
    }
    if (ashift && ashift !== "0") {
      cmd.push("-o", `ashift=${ashift}`);
    }
    if (autoexpand) {
      cmd.push("-o", "autoexpand=on");
    }
    if (autoreplace) {
      cmd.push("-o", "autoreplace=on");
    }
    if (autotrim) {
      cmd.push("-o", "autotrim=on");
    }
    if (failmode !== "wait") {
      cmd.push("-o", `failmode=${failmode}`);
    }
    if (altroot.trim()) {
      cmd.push("-R", altroot.trim());
    }
    if (mountpoint.trim()) {
      cmd.push("-m", mountpoint.trim());
    }
    if (compression !== "off") {
      cmd.push("-O", `compression=${compression}`);
    }
    if (dedup !== "off") {
      cmd.push("-O", `dedup=${dedup}`);
    }
    if (!atime) {
      cmd.push("-O", "atime=off");
    }
    if (sync !== "standard") {
      cmd.push("-O", `sync=${sync}`);
    }
    if (recordsize !== "128k") {
      cmd.push("-O", `recordsize=${recordsize}`);
    }

    cmd.push(name.trim() || "poolname");

    vdevs.forEach((v) => {
      if (v.devices.length > 0) {
        if (v.type === "mirror") {
          cmd.push("mirror");
        } else if (v.type === "raidz1") {
          cmd.push("raidz1");
        } else if (v.type === "raidz2") {
          cmd.push("raidz2");
        } else if (v.type === "raidz3") {
          cmd.push("raidz3");
        } else if (v.type === "cache") {
          cmd.push("cache");
        } else if (v.type === "log") {
          cmd.push("log");
        } else if (v.type === "spare") {
          cmd.push("spare");
        } else if (v.type === "special") {
          cmd.push("special");
        }
        cmd.push(...v.devices);
      }
    });

    return cmd;
  };

  const handleFinish = async () => {
    if (!name.trim()) {
      setError("Pool name is required");
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
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const addVDev = (type: VDevEntry["type"]) => {
    setVdevs([
      ...vdevs,
      { id: `vdev-${Date.now()}`, type, devices: [] },
    ]);
  };

  const removeVDev = (id: string) => {
    setVdevs(vdevs.filter((v) => v.id !== id));
  };

  const toggleDeviceInVDev = (vdevId: string, devPath: string) => {
    setVdevs(
      vdevs.map((v) => {
        if (v.id !== vdevId) {
          return v;
        }
        const exists = v.devices.includes(devPath);
        return {
          ...v,
          devices: exists
            ? v.devices.filter((d) => d !== devPath)
            : [...v.devices, devPath],
        };
      })
    );
  };

  const allAssignedDevices = vdevs.flatMap((v) => v.devices);

  return (
    <Wizard
      title="Create ZFS Storage Pool"
      description="Configure a new software-defined ZFS storage pool with redundancy, caching, and compression."
      isOpen={isOpen}
      onClose={onClose}
      onSave={handleFinish}
      height={650}
      width={900}
    >
      {/* Step 1: Choose Name & Sector Size */}
      <WizardStep name="Name &amp; Ashift" id="step-1">
        <Form style={{ maxWidth: "600px" }}>
          <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
            Step 1: Pool Name &amp; Base Settings
          </Title>

          <FormGroup label="Pool Name" isRequired fieldId="create-name">
            <TextInput
              id="create-name"
              value={name}
              onChange={(_event, val) => setName(val)}
              placeholder="e.g. tank, datapool"
              autoFocus
            />
          </FormGroup>

          <FormGroup label="Sector Size (Ashift)" fieldId="create-ashift">
            <FormSelect
              id="create-ashift"
              value={ashift}
              onChange={(_event, val) => setAshift(val)}
            >
              <FormSelectOption value="12" label="12 - 4 KiB sectors (Recommended for most modern HDDs & SSDs)" />
              <FormSelectOption value="13" label="13 - 8 KiB sectors (High-capacity SSDs / NVMe)" />
              <FormSelectOption value="14" label="14 - 16 KiB sectors (Specialized NVMe)" />
              <FormSelectOption value="9" label="9 - 512 Bytes legacy sectors" />
              <FormSelectOption value="0" label="Auto-detect from drive inquiry" />
            </FormSelect>
          </FormGroup>

          <FormGroup label="Alternate Root (altroot)" fieldId="create-altroot">
            <TextInput
              id="create-altroot"
              value={altroot}
              onChange={(_event, val) => setAltroot(val)}
              placeholder="Optional temporary mount root (e.g. /mnt)"
            />
          </FormGroup>

          <FormGroup label="Root Mountpoint" fieldId="create-mountpoint">
            <TextInput
              id="create-mountpoint"
              value={mountpoint}
              onChange={(_event, val) => setMountpoint(val)}
              placeholder="Default is /<pool_name>"
            />
          </FormGroup>
        </Form>
      </WizardStep>

      {/* Step 2: Select Disks & VDevs */}
      <WizardStep name="Disks &amp; VDevs" id="step-2">
        <div>
          <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "1rem" }}>
            <FlexItem>
              <Title headingLevel="h3" size="lg">
                Step 2: Configure VDevs &amp; Select Disks
              </Title>
            </FlexItem>
            <FlexItem>
              <Flex>
                <FlexItem>
                  <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => addVDev("mirror")}>
                    Add Mirror
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
            </FlexItem>
          </Flex>

          {vdevs.map((vdev, index) => (
            <Card key={vdev.id} style={{ marginBottom: "1.5rem" }}>
              <CardBody>
                <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "0.5rem" }}>
                  <FlexItem>
                    <strong>VDev #{index + 1}:</strong>{" "}
                    <Badge isRead>{vdev.type.toUpperCase()}</Badge> ({vdev.devices.length} disk(s) selected)
                  </FlexItem>
                  <FlexItem>
                    {vdevs.length > 1 && (
                      <Button
                        variant="plain"
                        icon={<TrashIcon />}
                        onClick={() => removeVDev(vdev.id)}
                        aria-label="Remove VDev"
                      />
                    )}
                  </FlexItem>
                </Flex>

                <Table variant="compact">
                  <Thead>
                    <Tr>
                      <Th style={{ width: "50px" }} />
                      <Th>Device Path</Th>
                      <Th>Model / Serial</Th>
                      <Th>Size</Th>
                      <Th>SMART Health</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {availableDisks.map((d) => {
                      const isAssignedToThis = vdev.devices.includes(d.path);
                      const isAssignedOther = !isAssignedToThis && allAssignedDevices.includes(d.path);

                      return (
                        <Tr key={d.path} style={{ opacity: isAssignedOther ? 0.4 : 1 }}>
                          <Td
                            select={{
                              rowIndex: 0,
                              onSelect: () => toggleDeviceInVDev(vdev.id, d.path),
                              isSelected: isAssignedToThis,
                              props: { disabled: isAssignedOther },
                            }}
                          />
                          <Td>
                            <strong>{d.path}</strong> ({d.name})
                          </Td>
                          <Td>{d.model || d.serial || "-"}</Td>
                          <Td>{formatBytes(d.size)}</Td>
                          <Td>
                            <Badge isRead>{d.smart_health}</Badge>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          ))}

          <FormGroup fieldId="create-force">
            <Checkbox
              id="create-force"
              label="Force pool creation (-f, bypass disk in-use or partition signature warnings)"
              isChecked={force}
              onChange={(_event, checked) => setForce(checked)}
            />
          </FormGroup>
        </div>
      </WizardStep>

      {/* Step 3: Pool Properties */}
      <WizardStep name="Pool Properties" id="step-3">
        <Form style={{ maxWidth: "600px" }}>
          <Title headingLevel="h3" size="lg" style={{ marginBottom: "1rem" }}>
            Step 3: Pool Properties
          </Title>

          <FormGroup fieldId="create-autoexpand">
            <Checkbox
              id="create-autoexpand"
              label="Autoexpand capacity when disks are replaced"
              isChecked={autoexpand}
              onChange={(_event, checked) => setAutoexpand(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="create-autoreplace">
            <Checkbox
              id="create-autoreplace"
              label="Autoreplace failed disks using hot spares"
              isChecked={autoreplace}
              onChange={(_event, checked) => setAutoreplace(checked)}
            />
          </FormGroup>

          <FormGroup fieldId="create-autotrim">
            <Checkbox
              id="create-autotrim"
              label="Autotrim SSD / NVMe devices in background"
              isChecked={autotrim}
              onChange={(_event, checked) => setAutotrim(checked)}
            />
          </FormGroup>

          <FormGroup label="Failure Mode (failmode)" fieldId="create-failmode">
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
              <FormSelectOption value="1M" label="1 MiB (Large sequential files & media)" />
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
              <p>
                <strong>Pool Name:</strong> {name || "<required>"}
              </p>
              <p>
                <strong>Sector Size (Ashift):</strong> {ashift}
              </p>
              <p>
                <strong>VDev Layout:</strong>{" "}
                {vdevs
                  .map((v) => `${v.type.toUpperCase()}: ${v.devices.length} disk(s)`)
                  .join("; ")}
              </p>
              <p>
                <strong>Compression:</strong> {compression}
              </p>
              <p>
                <strong>Deduplication:</strong> {dedup}
              </p>
            </CardBody>
          </Card>

          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.5rem" }}>
              Shell Command Preview:
            </label>
            <ClipboardCopy isReadOnly isCode>
              {buildCommand().join(" ")}
            </ClipboardCopy>
          </div>

          <div style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
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
          </div>

          {error && (
            <Alert variant="danger" title="Pool Creation Failed" style={{ marginBottom: "1rem" }}>
              {error}
            </Alert>
          )}
        </div>
      </WizardStep>
    </Wizard>
  );
};
