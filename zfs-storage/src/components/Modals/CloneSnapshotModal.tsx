import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Button,
  Alert,
} from "@patternfly/react-core";
import { ZSnapshot } from "../../types";
import { CommandBox } from "../CommandBox";

interface CloneSnapshotModalProps {
  isOpen: boolean;
  snapshot: ZSnapshot | null;
  onClose: () => void;
  onSubmit: (args: {
    snapshotName: string;
    clonePath: string;
    command: string[];
  }) => Promise<void>;
}

export const CloneSnapshotModal: React.FC<CloneSnapshotModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onSubmit,
}) => {
  const [clonePath, setClonePath] = useState(
    snapshot ? `${snapshot.dataset}-clone` : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !snapshot) {
    return null;
  }

  const buildCommand = (): string[] => {
    return ["zfs", "clone", snapshot.name, clonePath.trim() || "pool/dataset-clone"];
  };

  const handleClone = async () => {
    if (!clonePath.trim()) {
      setError("Clone target path is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        snapshotName: snapshot.name,
        clonePath: clonePath.trim(),
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
      title="Clone ZFS Snapshot"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="clone"
          variant="primary"
          onClick={handleClone}
          isDisabled={loading || !clonePath.trim()}
          isLoading={loading}
        >
          Clone Snapshot
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form>
        <FormGroup label="Source Snapshot" fieldId="cl-src">
          <TextInput id="cl-src" value={snapshot.name} isReadOnly />
        </FormGroup>

        <FormGroup label="Target Clone Path" isRequired fieldId="cl-target">
          <TextInput
            id="cl-target"
            value={clonePath}
            onChange={(_event, val) => setClonePath(val)}
            placeholder="e.g. pool/dataset-clone"
            autoFocus
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
