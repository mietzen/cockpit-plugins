import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Checkbox,
  Button,
  ClipboardCopy,
  Alert,
} from "@patternfly/react-core";
import { ZSnapshot } from "../../types";

interface RollbackSnapshotModalProps {
  isOpen: boolean;
  snapshot: ZSnapshot | null;
  onClose: () => void;
  onSubmit: (args: {
    snapshot: ZSnapshot;
    destroyIntermediate: boolean;
    force: boolean;
    command: string[];
  }) => Promise<void>;
}

export const RollbackSnapshotModal: React.FC<RollbackSnapshotModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onSubmit,
}) => {
  const [destroyIntermediate, setDestroyIntermediate] = useState(true);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !snapshot) {
    return null;
  }

  const buildCommand = (): string[] => {
    const cmd = ["zfs", "rollback"];
    if (destroyIntermediate) {
      cmd.push("-r");
    }
    if (force) {
      cmd.push("-f");
    }
    cmd.push(snapshot.name);
    return cmd;
  };

  const handleRollback = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        snapshot,
        destroyIntermediate,
        force,
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
          Rollback
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Alert
        variant="warning"
        isInline
        title="Warning: Data Modified After Snapshot Will Be Lost"
        style={{ marginBottom: "1rem" }}
      >
        Rolling back will revert dataset <strong>{snapshot.dataset}</strong> to the exact state captured in snapshot <strong>@{snapshot.snapshot_name}</strong>.
      </Alert>

      <div style={{ marginBottom: "1rem" }}>
        <Checkbox
          id="rb-destroy-more-recent"
          label="Destroy any snapshots and bookmarks created more recently than this one (-r)"
          isChecked={destroyIntermediate}
          onChange={(_event, checked) => setDestroyIntermediate(checked)}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <Checkbox
          id="rb-force"
          label="Force unmount if dataset is busy (-f)"
          isChecked={force}
          onChange={(_event, checked) => setForce(checked)}
        />
      </div>

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
    </Modal>
  );
};
