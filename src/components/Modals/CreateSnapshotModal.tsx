import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Button,
  Alert,
} from "@patternfly/react-core";
import { CommandBox } from "../CommandBox";

interface CreateSnapshotModalProps {
  isOpen: boolean;
  defaultDataset: string;
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
  defaultDataset,
  onClose,
  onSubmit,
}) => {
  const [snapshotName, setSnapshotName] = useState(
    `snap-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`
  );
  const [recursive, setRecursive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "snapshot"];
    if (recursive) {
      cmd.push("-r");
    }
    cmd.push(`${defaultDataset}@${snapshotName.trim() || "snap"}`);
    return cmd;
  };

  const handleSave = async () => {
    if (!snapshotName.trim()) {
      setError("Snapshot name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        dataset: defaultDataset,
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
      variant={ModalVariant.small}
      title="Create ZFS Snapshot"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="create"
          variant="primary"
          onClick={handleSave}
          isDisabled={loading || !snapshotName.trim()}
          isLoading={loading}
        >
          Create Snapshot
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form>
        <FormGroup label="Target Dataset" fieldId="snap-dataset">
          <TextInput id="snap-dataset" value={defaultDataset} isReadOnly />
        </FormGroup>

        <FormGroup label="Snapshot Name (Tag)" isRequired fieldId="snap-name">
          <TextInput
            id="snap-name"
            value={snapshotName}
            onChange={(_event, val) => setSnapshotName(val)}
            placeholder="e.g. backup-daily, before-upgrade"
            autoFocus
          />
        </FormGroup>

        <FormGroup fieldId="snap-recursive">
          <Checkbox
            id="snap-recursive"
            label="Recursive (-r, snapshot all child datasets & volumes)"
            isChecked={recursive}
            onChange={(_event, checked) => setRecursive(checked)}
          />
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
