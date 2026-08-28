import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  ClipboardCopy,
  Alert,
} from "@patternfly/react-core";

interface CreateZVolModalProps {
  isOpen: boolean;
  parentPath: string;
  onClose: () => void;
  onSubmit: (args: {
    path: string;
    size: string;
    volblocksize: string;
    sparse: boolean;
    compression: string;
    dedup: string;
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
  const [size, setSize] = useState("20G");
  const [volblocksize, setVolblocksize] = useState("16k");
  const [sparse, setSparse] = useState(true);
  const [compression, setCompression] = useState("lz4");
  const [dedup, setDedup] = useState("off");
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
    cmd.push("-V", size.trim() || "20G");
    if (volblocksize) {
      cmd.push("-b", volblocksize);
    }
    if (compression !== "off") {
      cmd.push("-o", `compression=${compression}`);
    }
    if (dedup !== "off") {
      cmd.push("-o", `dedup=${dedup}`);
    }
    cmd.push(fullPath || "pool/zvol");
    return cmd;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Volume name is required");
      return;
    }
    if (!size.trim()) {
      setError("Volume size is required (e.g. 20G)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        path: fullPath,
        size: size.trim(),
        volblocksize,
        sparse,
        compression,
        dedup,
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
      title="Create ZFS Block Volume (ZVol)"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="create"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading || !name.trim()}
          isLoading={loading}
        >
          Create ZVol
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
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
            placeholder="e.g. vm-100-disk0"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="Volume Size" isRequired fieldId="zvol-size">
          <TextInput
            id="zvol-size"
            value={size}
            onChange={(_event, val) => setSize(val)}
            placeholder="e.g. 10G, 50G, 1T"
          />
        </FormGroup>

        <FormGroup label="Volume Block Size (volblocksize)" fieldId="zvol-blocksize">
          <FormSelect
            id="zvol-blocksize"
            value={volblocksize}
            onChange={(_event, val) => setVolblocksize(val)}
          >
            <FormSelectOption value="8k" label="8 KiB" />
            <FormSelectOption value="16k" label="16 KiB (Recommended for VMs)" />
            <FormSelectOption value="32k" label="32 KiB" />
            <FormSelectOption value="64k" label="64 KiB" />
            <FormSelectOption value="128k" label="128 KiB" />
          </FormSelect>
        </FormGroup>

        <FormGroup fieldId="zvol-sparse">
          <Checkbox
            id="zvol-sparse"
            label="Sparse Volume (-s, thin provisioning / allocate space on demand)"
            isChecked={sparse}
            onChange={(_event, checked) => setSparse(checked)}
          />
        </FormGroup>

        <FormGroup label="Compression" fieldId="zvol-comp">
          <FormSelect
            id="zvol-comp"
            value={compression}
            onChange={(_event, val) => setCompression(val)}
          >
            <FormSelectOption value="lz4" label="lz4 (Fast, recommended)" />
            <FormSelectOption value="zstd" label="zstd (High ratio)" />
            <FormSelectOption value="gzip" label="gzip" />
            <FormSelectOption value="off" label="off" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Deduplication" fieldId="zvol-dedup">
          <FormSelect
            id="zvol-dedup"
            value={dedup}
            onChange={(_event, val) => setDedup(val)}
          >
            <FormSelectOption value="off" label="off" />
            <FormSelectOption value="on" label="on" />
            <FormSelectOption value="verify" label="verify" />
          </FormSelect>
        </FormGroup>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.5rem" }}>
            Shell Command Preview:
          </label>
          <ClipboardCopy isReadOnly isCode>
            {buildCommand().join(" ")}
          </ClipboardCopy>
        </div>

        {error && (
          <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </Form>
    </Modal>
  );
};
