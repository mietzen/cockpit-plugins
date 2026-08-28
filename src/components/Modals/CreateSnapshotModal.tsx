import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Button,
  ClipboardCopy,
  Alert,
} from "@patternfly/react-core";

interface CreateSnapshotModalProps {
  isOpen: boolean;
  defaultDataset?: string;
  onClose: () => void;
  onSubmit: (args: {
    dataset: string;
    snapshotName: string;
    recursive: boolean;
    command: string[];
  }) => Promise<void>;
}

export const CreateSnapshotModal: React.FC<CreateSnapshotModalProps> = ({
  isOpen,
  defaultDataset = "",
  onClose,
  onSubmit,
}) => {
  const defaultSnapName = `auto-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const [dataset, setDataset] = useState(defaultDataset);
  const [snapshotName, setSnapshotName] = useState(defaultSnapName);
  const [recursive, setRecursive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const fullSnapPath = `${dataset.trim()}@${snapshotName.trim()}`;

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "snapshot"];
    if (recursive) {
      cmd.push("-r");
    }
    cmd.push(fullSnapPath || "pool/dataset@snapshot");
    return cmd;
  };

  const handleSave = async () => {
    if (!dataset.trim()) {
      setError("Dataset is required");
      return;
    }
    if (!snapshotName.trim()) {
      setError("Snapshot name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        dataset: dataset.trim(),
        snapshotName: snapshotName.trim(),
        recursive,
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
      title="Create ZFS Snapshot"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="create"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading || !dataset.trim() || !snapshotName.trim()}
          isLoading={loading}
        >
          Create Snapshot
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Target Dataset" isRequired fieldId="snap-ds">
          <TextInput
            id="snap-ds"
            value={dataset}
            onChange={(_event, val) => setDataset(val)}
            placeholder="e.g. tank/data"
          />
        </FormGroup>

        <FormGroup label="Snapshot Name" isRequired fieldId="snap-name">
          <TextInput
            id="snap-name"
            value={snapshotName}
            onChange={(_event, val) => setSnapshotName(val)}
            placeholder="e.g. backup-2026-08-28"
          />
        </FormGroup>

        <FormGroup fieldId="snap-recursive">
          <Checkbox
            id="snap-recursive"
            label="Recursive snapshot (-r, create snapshots of all child datasets too)"
            isChecked={recursive}
            onChange={(_event, checked) => setRecursive(checked)}
          />
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
