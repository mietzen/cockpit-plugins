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
import { DiskDevice } from "../../types";
import { formatBytes } from "../../utils/formatters";

interface AttachDiskModalProps {
  isOpen: boolean;
  poolName: string;
  existingDevice: string;
  availableDisks: DiskDevice[];
  onClose: () => void;
  onSubmit: (args: {
    poolName: string;
    existingDevice: string;
    newDevice: string;
    force: boolean;
    command: string[];
  }) => Promise<void>;
}

export const AttachDiskModal: React.FC<AttachDiskModalProps> = ({
  isOpen,
  poolName,
  existingDevice,
  availableDisks,
  onClose,
  onSubmit,
}) => {
  const [newDevice, setNewDevice] = useState(
    availableDisks.length > 0 ? availableDisks[0].path : ""
  );
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const buildCommand = (): string[] => {
    const cmd = ["zpool", "attach"];
    if (force) {
      cmd.push("-f");
    }
    cmd.push(poolName, existingDevice, newDevice || "/dev/sdX");
    return cmd;
  };

  const handleAttach = async () => {
    if (!newDevice) {
      setError("Please select a device to attach");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        poolName,
        existingDevice,
        newDevice,
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
      title={`Attach Mirror Device to: ${existingDevice}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="attach"
          variant="primary"
          onClick={handleAttach}
          isDisabled={loading || !newDevice}
          isLoading={loading}
        >
          Attach Device
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Target Pool" fieldId="attach-pool">
          <TextInput id="attach-pool" value={poolName} isReadOnly />
        </FormGroup>

        <FormGroup label="Existing Device" fieldId="attach-existing">
          <TextInput id="attach-existing" value={existingDevice} isReadOnly />
        </FormGroup>

        <FormGroup label="Select New Device to Attach" isRequired fieldId="attach-new">
          <FormSelect
            id="attach-new"
            value={newDevice}
            onChange={(_event, val) => setNewDevice(val)}
          >
            {availableDisks.map((d) => (
              <FormSelectOption
                key={d.path}
                value={d.path}
                label={`${d.path} (${d.name}) - ${formatBytes(d.size)} ${d.model ? `[${d.model}]` : ""}`}
              />
            ))}
          </FormSelect>
        </FormGroup>

        <FormGroup fieldId="attach-force">
          <Checkbox
            id="attach-force"
            label="Force attach (-f)"
            isChecked={force}
            onChange={(_event, checked) => setForce(checked)}
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
