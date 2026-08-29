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
import { ZSnapshot } from "../../types";
import { CommandBox } from "../CommandBox";

interface RollbackSnapshotModalProps {
  isOpen: boolean;
  snapshot: ZSnapshot | null;
  onClose: () => void;
  onSubmit: (args: {
    snapshotName: string;
    destroyMoreRecent: boolean;
    command: string[];
  }) => Promise<void>;
}

export const RollbackSnapshotModal: React.FC<RollbackSnapshotModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onSubmit,
}) => {
  const [destroyMoreRecent, setDestroyMoreRecent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !snapshot) {
    return null;
  }

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "rollback"];
    if (destroyMoreRecent) {
      cmd.push("-r");
    }
    cmd.push(snapshot.name);
    return cmd;
  };

  const handleRollback = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        snapshotName: snapshot.name,
        destroyMoreRecent,
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
      title="Rollback Dataset to Snapshot"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="rollback"
          variant="danger"
          onClick={handleRollback}
          isDisabled={loading}
          isLoading={loading}
        >
          Rollback Dataset
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Alert
        variant="warning"
        isInline
        title="Warning: Data Loss"
        style={{ marginBottom: "1rem" }}
      >
        Rolling back will revert all data in <strong>{snapshot.dataset}</strong> to the exact state
        captured at snapshot <strong>@{snapshot.snapshot_name}</strong>.
      </Alert>

      <Form>
        <FormGroup label="Target Snapshot" fieldId="rb-snap">
          <TextInput id="rb-snap" value={snapshot.name} isReadOnly />
        </FormGroup>

        <FormGroup fieldId="rb-recent">
          <Checkbox
            id="rb-recent"
            label="Destroy snapshots and bookmarks more recent than this one (-r)"
            isChecked={destroyMoreRecent}
            onChange={(_event, checked) => setDestroyMoreRecent(checked)}
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
