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
  const isHierarchical = itemType !== "snapshot" && currentName.includes("/");
  const parentPath = isHierarchical
    ? currentName.substring(0, currentName.lastIndexOf("/"))
    : "";
  const leafName = isHierarchical
    ? currentName.substring(currentName.lastIndexOf("/") + 1)
    : currentName;

  const [newName, setNewName] = useState(leafName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewName(leafName);
    setError(null);
    setLoading(false);
  }, [currentName, leafName, isOpen]);

  if (!isOpen) {
    return null;
  }

  const computedTargetPath =
    isHierarchical && !newName.trim().includes("/") && parentPath
      ? `${parentPath}/${newName.trim()}`
      : newName.trim();

  const isUnchanged =
    newName.trim() === leafName || computedTargetPath === currentName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isUnchanged) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onRename(computedTargetPath);
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
          isDisabled={loading || !newName.trim() || isUnchanged}
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
        <FormGroup label="Current path" fieldId="rename-current">
          <TextInput id="rename-current" value={currentName} isReadOnly />
        </FormGroup>
        <FormGroup
          label={itemType === "snapshot" ? "New snapshot name" : "New name"}
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
        {isHierarchical && (
          <div style={{ fontSize: "0.85rem", color: "var(--zfs-text-secondary)", marginTop: "-0.5rem" }}>
            Full target: <code>{computedTargetPath}</code>
          </div>
        )}
      </Form>
    </Modal>
  );
};
