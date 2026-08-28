import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Button,
  ClipboardCopy,
  Alert,
} from "@patternfly/react-core";
import { ZSnapshot } from "../../types";

interface CloneSnapshotModalProps {
  isOpen: boolean;
  snapshot: ZSnapshot | null;
  onClose: () => void;
  onSubmit: (args: {
    snapshot: ZSnapshot;
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
    return ["zfs", "clone", snapshot.name, clonePath.trim() || "pool/clone"];
  };

  const handleClone = async () => {
    if (!clonePath.trim()) {
      setError("Clone path is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        snapshot,
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
      title="Clone Snapshot to New Dataset"
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
          Create Clone
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Source Snapshot" fieldId="clone-source">
          <TextInput id="clone-source" value={snapshot.name} isReadOnly />
        </FormGroup>

        <FormGroup label="Target Clone Dataset Path" isRequired fieldId="clone-target">
          <TextInput
            id="clone-target"
            value={clonePath}
            onChange={(_event, val) => setClonePath(val)}
            placeholder="e.g. tank/data-restore"
            autoFocus
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
