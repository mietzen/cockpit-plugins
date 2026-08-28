import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Button,
  Flex,
  FlexItem,
  Alert,
} from "@patternfly/react-core";

interface RenameModalProps {
  isOpen: boolean;
  itemType: "dataset" | "volume" | "snapshot";
  currentName: string;
  onClose: () => void;
  onRename: (newName: string) => Promise<void>;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  itemType,
  currentName,
  onClose,
  onRename,
}) => {
  const [newName, setNewName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(currentName);
    setError(null);
    setLoading(false);
  }, [currentName, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === currentName) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onRename(newName.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || String(err));
      setLoading(false);
    }
  };

  const titleText =
    itemType === "snapshot"
      ? "Rename Snapshot"
      : itemType === "volume"
      ? "Rename Volume"
      : "Rename Dataset";

  return (
    <Modal
      variant={ModalVariant.small}
      title={titleText}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="confirm"
          variant="primary"
          onClick={handleSubmit}
          isLoading={loading}
          isDisabled={loading || !newName.trim() || newName.trim() === currentName}
        >
          Rename
        </Button>,
        <Button key="cancel" variant="secondary" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form onSubmit={handleSubmit}>
        {error && (
          <Alert variant="danger" isInline title="Failed to rename" style={{ marginBottom: "1rem" }}>
            {error}
          </Alert>
        )}
        <FormGroup label="Current path / name" fieldId="rename-current">
          <TextInput id="rename-current" value={currentName} isReadOnly />
        </FormGroup>
        <FormGroup
          label={itemType === "snapshot" ? "New snapshot name" : "New target path"}
          fieldId="rename-new"
          isRequired
        >
          <TextInput
            id="rename-new"
            value={newName}
            onChange={(_event, val) => setNewName(val)}
            autoFocus
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};
