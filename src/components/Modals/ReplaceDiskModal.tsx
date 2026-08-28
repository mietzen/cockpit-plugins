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

interface ReplaceDiskModalProps {
  isOpen: boolean;
  poolName: string;
  oldDevice: string;
  availableDisks: DiskDevice[];
  onClose: () => void;
  onSubmit: (args: {
    poolName: string;
    oldDevice: string;
    newDevice: string;
    force: boolean;
    command: string[];
  }) => Promise<void>;
}

export const ReplaceDiskModal: React.FC<ReplaceDiskModalProps> = ({
  isOpen,
  poolName,
  oldDevice,
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
    const cmd = ["zpool", "replace"];
    if (force) {
      cmd.push("-f");
    }
    cmd.push(poolName, oldDevice, newDevice || "/dev/sdX");
    return cmd;
  };

  const handleReplace = async () => {
    if (!newDevice) {
      setError("Please select a replacement device");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        poolName,
        oldDevice,
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
      title={`Replace Device: ${oldDevice}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="replace"
          variant="primary"
          onClick={handleReplace}
          isDisabled={loading || !newDevice}
          isLoading={loading}
        >
          Replace Device
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={loading}>
          Cancel
        </Button>,
      ]}
    >
      <Form style={{ maxWidth: "550px" }}>
        <FormGroup label="Target Pool" fieldId="replace-pool">
          <TextInput id="replace-pool" value={poolName} isReadOnly />
        </FormGroup>

        <FormGroup label="Device Being Replaced" fieldId="replace-old">
          <TextInput id="replace-old" value={oldDevice} isReadOnly />
        </FormGroup>

        <FormGroup label="Select Replacement Device" isRequired fieldId="replace-new">
          <FormSelect
            id="replace-new"
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

        <FormGroup fieldId="replace-force">
          <Checkbox
            id="replace-force"
            label="Force replacement (-f)"
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
