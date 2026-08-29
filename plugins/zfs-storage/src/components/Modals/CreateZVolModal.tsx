import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Button,
  Alert,
} from "@patternfly/react-core";
import { CommandBox } from "../CommandBox";

interface CreateZVolModalProps {
  isOpen: boolean;
  parentPath: string;
  onClose: () => void;
  onSubmit: (args: {
    path: string;
    size: string;
    volblocksize: string;
    compression: string;
    dedup: string;
    sync: string;
    sparse: boolean;
    command: string[];
  }) => Promise<void>;
}

export const CreateZVolModal: React.FC<CreateZVolModalProps> = ({
  isOpen,
  parentPath,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [size, setSize] = useState("10G");
  const [volblocksize, setVolblocksize] = useState("16k");
  const [compression, setCompression] = useState("lz4");
  const [dedup, setDedup] = useState("off");
  const [sync, setSync] = useState("standard");
  const [sparse, setSparse] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const fullPath = parentPath ? `${parentPath}/${name.trim()}` : name.trim();

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "create"];
    if (sparse) {
      cmd.push("-s");
    }
    cmd.push("-V", size.trim() || "10G");
    if (volblocksize !== "8k") {
      cmd.push("-b", volblocksize);
    }
    if (compression !== "off") {
      cmd.push("-o", `compression=${compression}`);
    }
    if (dedup !== "off") {
      cmd.push("-o", `dedup=${dedup}`);
    }
    if (sync !== "standard") {
      cmd.push("-o", `sync=${sync}`);
    }
    cmd.push(fullPath || "pool/zvol");
    return cmd;
  };

  const handleSave = async () => {
    if (!name.trim() || !size.trim()) {
      setError("Volume name and size are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        path: fullPath,
        size,
        volblocksize,
        compression,
        dedup,
        sync,
        sparse,
        command: buildCommand(),
      });
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Create ZFS Block Volume (zvol)"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="create"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading || !name.trim() || !size.trim()}
          isLoading={loading}
        >
          Create Volume
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Parent Path" fieldId="zvol-parent">
          <TextInput id="zvol-parent" value={parentPath} isReadOnly />
        </FormGroup>

        <FormGroup label="Volume Name" isRequired fieldId="zvol-name">
          <TextInput
            id="zvol-name"
            value={name}
            onChange={(_event, val) => setName(val)}
            placeholder="e.g. vm-disk0, iscsi-lun1"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="Volume Size (e.g. 20G, 500M, 1T)" isRequired fieldId="zvol-size">
          <TextInput
            id="zvol-size"
            value={size}
            onChange={(_event, val) => setSize(val)}
            placeholder="10G"
          />
        </FormGroup>

        <FormGroup label="Block Size (volblocksize)" fieldId="zvol-blocksize">
          <FormSelect
            id="zvol-blocksize"
            value={volblocksize}
            onChange={(_event, val) => setVolblocksize(val)}
          >
            <FormSelectOption value="16k" label="16 KiB (Recommended for VM disks &amp; databases)" />
            <FormSelectOption value="8k" label="8 KiB (Standard default)" />
            <FormSelectOption value="64k" label="64 KiB" />
            <FormSelectOption value="128k" label="128 KiB" />
            <FormSelectOption value="4k" label="4 KiB" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Allocation (Thin Provisioning)" fieldId="zvol-sparse">
          <FormSelect
            id="zvol-sparse"
            value={sparse ? "sparse" : "dense"}
            onChange={(_event, val) => setSparse(val === "sparse")}
          >
            <FormSelectOption value="sparse" label="Sparse (Thin Provisioning - Allocate space on demand)" />
            <FormSelectOption value="dense" label="Thick Provisioning (Reserve all space immediately)" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Compression" fieldId="zvol-comp">
          <FormSelect
            id="zvol-comp"
            value={compression}
            onChange={(_event, val) => setCompression(val)}
          >
            <FormSelectOption value="lz4" label="lz4 (Fast, recommended)" />
            <FormSelectOption value="zstd" label="zstd (High ratio)" />
            <FormSelectOption value="off" label="off" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Deduplication" fieldId="zvol-dedup">
          <FormSelect
            id="zvol-dedup"
            value={dedup}
            onChange={(_event, val) => setDedup(val)}
          >
            <FormSelectOption value="off" label="off (Recommended)" />
            <FormSelectOption value="on" label="on" />
          </FormSelect>
        </FormGroup>

        <CommandBox command={buildCommand()} />

        {error && (
          <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </Form>
    </Modal>
  );
};
