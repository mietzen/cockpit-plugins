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
import { ZDataset } from "../../types";

interface EditPropertiesModalProps {
  isOpen: boolean;
  dataset: ZDataset | null;
  onClose: () => void;
  onSubmit: (args: {
    dataset: ZDataset;
    properties: Record<string, string>;
    commands: string[][];
  }) => Promise<void>;
}

export const EditPropertiesModal: React.FC<EditPropertiesModalProps> = ({
  isOpen,
  dataset,
  onClose,
  onSubmit,
}) => {
  const [compression, setCompression] = useState(dataset?.compression || "lz4");
  const [quota, setQuota] = useState(dataset?.quota ? String(dataset.quota) : "");
  const [reservation, setReservation] = useState(dataset?.reservation ? String(dataset.reservation) : "");
  const [recordsize, setRecordsize] = useState(dataset?.recordsize ? `${dataset.recordsize / 1024}k` : "128k");
  const [atime, setAtime] = useState(dataset?.atime ?? true);
  const [sync, setSync] = useState(dataset?.sync || "standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !dataset) {
    return null;
  }

  const buildCommands = (): string[][] => {
    const cmds: string[][] = [];
    if (compression !== dataset.compression) {
      cmds.push(["zfs", "set", `compression=${compression}`, dataset.name]);
    }
    if (quota.trim() && quota.trim() !== String(dataset.quota)) {
      cmds.push(["zfs", "set", `quota=${quota.trim()}`, dataset.name]);
    }
    if (reservation.trim() && reservation.trim() !== String(dataset.reservation)) {
      cmds.push(["zfs", "set", `reservation=${reservation.trim()}`, dataset.name]);
    }
    if (recordsize !== `${dataset.recordsize / 1024}k`) {
      cmds.push(["zfs", "set", `recordsize=${recordsize}`, dataset.name]);
    }
    if (atime !== dataset.atime) {
      cmds.push(["zfs", "set", `atime=${atime ? "on" : "off"}`, dataset.name]);
    }
    if (sync !== dataset.sync) {
      cmds.push(["zfs", "set", `sync=${sync}`, dataset.name]);
    }
    return cmds;
  };

  const handleSave = async () => {
    const cmds = buildCommands();
    if (cmds.length === 0) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const props: Record<string, string> = {
        compression,
        quota: quota.trim() || "none",
        reservation: reservation.trim() || "none",
        recordsize,
        atime: atime ? "on" : "off",
        sync,
      };
      await onSubmit({ dataset, properties: props, commands: cmds });
      setLoading(false);
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const cmds = buildCommands();

  return (
    <Modal
      variant={ModalVariant.medium}
      title={`Edit Properties: ${dataset.name}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading}
          isLoading={loading}
        >
          Save Changes
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Dataset Name" fieldId="edit-name">
          <TextInput id="edit-name" value={dataset.name} isReadOnly />
        </FormGroup>

        <FormGroup label="Compression" fieldId="edit-comp">
          <FormSelect
            id="edit-comp"
            value={compression}
            onChange={(_event, val) => setCompression(val)}
          >
            <FormSelectOption value="lz4" label="lz4" />
            <FormSelectOption value="zstd" label="zstd" />
            <FormSelectOption value="gzip" label="gzip" />
            <FormSelectOption value="on" label="on" />
            <FormSelectOption value="off" label="off" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Quota (Limit Space)" fieldId="edit-quota">
          <TextInput
            id="edit-quota"
            value={quota}
            onChange={(_event, val) => setQuota(val)}
            placeholder="e.g. 100G, 1T, none"
          />
        </FormGroup>

        <FormGroup label="Reservation (Guarantee Space)" fieldId="edit-res">
          <TextInput
            id="edit-res"
            value={reservation}
            onChange={(_event, val) => setReservation(val)}
            placeholder="e.g. 50G, none"
          />
        </FormGroup>

        <FormGroup label="Recordsize (Block Size)" fieldId="edit-rec">
          <FormSelect
            id="edit-rec"
            value={recordsize}
            onChange={(_event, val) => setRecordsize(val)}
          >
            <FormSelectOption value="128k" label="128 KiB" />
            <FormSelectOption value="1M" label="1 MiB" />
            <FormSelectOption value="64k" label="64 KiB" />
            <FormSelectOption value="16k" label="16 KiB" />
            <FormSelectOption value="4k" label="4 KiB" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Synchronous I/O (sync)" fieldId="edit-sync">
          <FormSelect
            id="edit-sync"
            value={sync}
            onChange={(_event, val) => setSync(val)}
          >
            <FormSelectOption value="standard" label="standard" />
            <FormSelectOption value="always" label="always" />
            <FormSelectOption value="disabled" label="disabled" />
          </FormSelect>
        </FormGroup>

        <FormGroup fieldId="edit-atime">
          <Checkbox
            id="edit-atime"
            label="Enable atime (access time updates)"
            isChecked={atime}
            onChange={(_event, checked) => setAtime(checked)}
          />
        </FormGroup>

        {cmds.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: "0.5rem" }}>
              Shell Commands Preview:
            </label>
            <ClipboardCopy isReadOnly isCode>
              {cmds.map((c) => c.join(" ")).join("\n")}
            </ClipboardCopy>
          </div>
        )}

        {error && (
          <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </Form>
    </Modal>
  );
};
