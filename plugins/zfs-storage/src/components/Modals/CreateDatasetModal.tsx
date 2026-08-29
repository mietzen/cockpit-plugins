import React, { useState, useEffect } from "react";
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
  Alert,
} from "@patternfly/react-core";
import { CommandBox } from "../CommandBox";
import { zfsApi } from "../../api/zfsClient";

interface CreateDatasetModalProps {
  isOpen: boolean;
  parentPath: string;
  onClose: () => void;
  onSubmit: (args: {
    path: string;
    compression: string;
    dedup: string;
    quota: string;
    recordsize: string;
    atime: boolean;
    sync: string;
    mountpoint: string;
    command: string[];
  }) => Promise<void>;
}

export const CreateDatasetModal: React.FC<CreateDatasetModalProps> = ({
  isOpen,
  parentPath,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [compression, setCompression] = useState("lz4");
  const [dedup, setDedup] = useState("off");
  const [quota, setQuota] = useState("");
  const [recordsize, setRecordsize] = useState("128k");
  const [atime, setAtime] = useState(true);
  const [sync, setSync] = useState("standard");
  const [mountpoint, setMountpoint] = useState("");
  const [shareSmb, setShareSmb] = useState(false);
  const [shareNfs, setShareNfs] = useState(false);
  const [services, setServices] = useState<{ smb: boolean; nfs: boolean }>({ smb: false, nfs: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      zfsApi.probeSharingServices().then((res) => setServices(res)).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const fullPath = parentPath ? `${parentPath}/${name.trim()}` : name.trim();

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "create"];
    if (compression !== "off") {
      cmd.push("-o", `compression=${compression}`);
    }
    if (dedup !== "off") {
      cmd.push("-o", `dedup=${dedup}`);
    }
    if (quota.trim()) {
      cmd.push("-o", `quota=${quota.trim()}`);
    }
    if (recordsize !== "128k") {
      cmd.push("-o", `recordsize=${recordsize}`);
    }
    if (!atime) {
      cmd.push("-o", "atime=off");
    }
    if (sync !== "standard") {
      cmd.push("-o", `sync=${sync}`);
    }
    if (mountpoint.trim()) {
      cmd.push("-o", `mountpoint=${mountpoint.trim()}`);
    }
    cmd.push(fullPath || "pool/dataset");
    return cmd;
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Dataset name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        path: fullPath,
        compression,
        dedup,
        quota,
        recordsize,
        atime,
        sync,
        mountpoint,
        command: buildCommand(),
      });

      if (shareSmb || shareNfs) {
        const targetPath = mountpoint.trim() || `/${fullPath}`;
        await zfsApi.shareDataset({ path: targetPath, smb: shareSmb, nfs: shareNfs });
      }

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
      title="Create ZFS Filesystem Dataset"
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
          Create Dataset
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Parent Path" fieldId="ds-parent">
          <TextInput id="ds-parent" value={parentPath} isReadOnly />
        </FormGroup>

        <FormGroup label="Dataset Name" isRequired fieldId="ds-name">
          <TextInput
            id="ds-name"
            value={name}
            onChange={(_event, val) => setName(val)}
            placeholder="e.g. data, logs, media"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="Compression" fieldId="ds-comp">
          <FormSelect
            id="ds-comp"
            value={compression}
            onChange={(_event, val) => setCompression(val)}
          >
            <FormSelectOption value="lz4" label="lz4 (Fast, recommended)" />
            <FormSelectOption value="zstd" label="zstd (High ratio)" />
            <FormSelectOption value="gzip" label="gzip" />
            <FormSelectOption value="off" label="off" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Deduplication" fieldId="ds-dedup">
          <FormSelect
            id="ds-dedup"
            value={dedup}
            onChange={(_event, val) => setDedup(val)}
          >
            <FormSelectOption value="off" label="off (Recommended)" />
            <FormSelectOption value="on" label="on" />
            <FormSelectOption value="verify" label="verify" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Quota (Limit Space)" fieldId="ds-quota">
          <TextInput
            id="ds-quota"
            value={quota}
            onChange={(_event, val) => setQuota(val)}
            placeholder="e.g. 50G, 1T, none"
          />
        </FormGroup>

        <FormGroup label="Recordsize (Block Size)" fieldId="ds-recsize">
          <FormSelect
            id="ds-recsize"
            value={recordsize}
            onChange={(_event, val) => setRecordsize(val)}
          >
            <FormSelectOption value="128k" label="128 KiB (Default)" />
            <FormSelectOption value="1M" label="1 MiB (Large files &amp; media)" />
            <FormSelectOption value="64k" label="64 KiB" />
            <FormSelectOption value="16k" label="16 KiB (Databases)" />
            <FormSelectOption value="4k" label="4 KiB" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Custom Mountpoint" fieldId="ds-mount">
          <TextInput
            id="ds-mount"
            value={mountpoint}
            onChange={(_event, val) => setMountpoint(val)}
            placeholder="Default is inherited from parent"
          />
        </FormGroup>

        <FormGroup fieldId="ds-atime">
          <Checkbox
            id="ds-atime"
            label="Enable atime (update access time on read)"
            isChecked={atime}
            onChange={(_event, checked) => setAtime(checked)}
          />
        </FormGroup>

        {(services.smb || services.nfs) && (
          <FormGroup label="File Sharing Options" fieldId="ds-sharing">
            {services.smb && (
              <Checkbox
                id="ds-share-smb"
                label="Share via SMB (Samba)"
                isChecked={shareSmb}
                onChange={(_event, checked) => setShareSmb(checked)}
              />
            )}
            {services.nfs && (
              <Checkbox
                id="ds-share-nfs"
                label="Share via NFS"
                isChecked={shareNfs}
                onChange={(_event, checked) => setShareNfs(checked)}
                style={{ marginTop: services.smb ? 6 : 0 }}
              />
            )}
          </FormGroup>
        )}

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
