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

interface DestroyModalProps {
  isOpen: boolean;
  itemType: "pool" | "dataset" | "snapshot" | "snapshots";
  itemName: string;
  onClose: () => void;
  onConfirm: (args: {
    name: string;
    recursive: boolean;
    force: boolean;
    command: string[];
  }) => Promise<void>;
}

export const DestroyModal: React.FC<DestroyModalProps> = ({
  isOpen,
  itemType,
  itemName,
  onClose,
  onConfirm,
}) => {
  const [confirmInput, setConfirmInput] = useState("");
  const [recursive, setRecursive] = useState(itemType === "dataset" || itemType === "snapshots");
  const [force, setForce] = useState(itemType === "pool" || itemType === "dataset");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const isConfirmed = confirmInput.trim() === itemName.trim();

  const buildCommand = (): string[] => {
    if (itemType === "pool") {
      const cmd = ["zpool", "destroy"];
      if (force) {
        cmd.push("-f");
      }
      cmd.push(itemName);
      return cmd;
    }

    const cmd = ["zfs", "destroy"];
    if (recursive) {
      cmd.push("-r");
    }
    if (force) {
      cmd.push("-f");
    }
    cmd.push(itemName);
    return cmd;
  };

  const handleDestroy = async () => {
    if (!isConfirmed) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        name: itemName,
        recursive,
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
      title={`Destroy ZFS ${itemType.toUpperCase()}: ${itemName}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="destroy"
          variant="danger"
          onClick={handleDestroy}
          isDisabled={!isConfirmed || loading}
          isLoading={loading}
        >
          Permanently Destroy
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Alert
        variant="danger"
        isInline
        title="Warning: Irreversible Data Loss"
        style={{ marginBottom: "1rem" }}
      >
        Destroying <strong>{itemName}</strong> will permanently erase all data stored in it.
      </Alert>

      <Form style={{ maxWidth: "550px" }}>
        {(itemType === "dataset" || itemType === "snapshots") && (
          <FormGroup fieldId="destroy-recursive">
            <Checkbox
              id="destroy-recursive"
              label="Recursively destroy all child datasets and snapshots (-r)"
              isChecked={recursive}
              onChange={(_event, checked) => setRecursive(checked)}
            />
          </FormGroup>
        )}

        {(itemType === "pool" || itemType === "dataset") && (
          <FormGroup fieldId="destroy-force">
            <Checkbox
              id="destroy-force"
              label="Force unmount and destroy even if busy (-f)"
              isChecked={force}
              onChange={(_event, checked) => setForce(checked)}
            />
          </FormGroup>
        )}

        <FormGroup
          label={`Please type "${itemName}" to confirm destruction:`}
          isRequired
          fieldId="destroy-confirm"
        >
          <TextInput
            id="destroy-confirm"
            value={confirmInput}
            onChange={(_event, val) => setConfirmInput(val)}
            placeholder={itemName}
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
