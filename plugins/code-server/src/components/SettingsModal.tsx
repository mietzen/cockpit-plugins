import React, { useState } from "react";
import {
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  FormSelect,
  FormSelectOption,
  Button,
  Flex,
  FlexItem,
  InputGroup,
  InputGroupItem,
} from "@patternfly/react-core";
import { EyeIcon, EyeSlashIcon } from "@patternfly/react-icons";
import { CodeServerConfigData } from "../types";

export interface SettingsModalProps {
  isOpen: boolean;
  config: CodeServerConfigData;
  isLoading: boolean;
  onClose: () => void;
  onSave: (newConfig: Partial<CodeServerConfigData>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  config,
  isLoading,
  onClose,
  onSave,
}) => {
  const [host, setHost] = useState<string>(config.host || "127.0.0.1");
  const [port, setPort] = useState<string>(String(config.port || 8080));
  const [auth, setAuth] = useState<string>(config.auth || "password");
  const [password, setPassword] = useState<string>(config.password || "");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [cert, setCert] = useState<boolean>(Boolean(config.cert));
  const [disableTelemetry, setDisableTelemetry] = useState<boolean>(
    Boolean(config.disable_telemetry)
  );

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(port, 10) || 8080;
    const bindAddr = `${host.trim()}:${portNum}`;

    await onSave({
      bind_addr: bindAddr,
      auth,
      password: auth === "password" ? password : "",
      cert,
      disable_telemetry: disableTelemetry,
    });
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="VS Code Server Configuration"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleFormSubmit}
          isLoading={isLoading}
          isDisabled={isLoading}
        >
          Save and Apply
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={isLoading}>
          Cancel
        </Button>,
      ]}
    >
      <Form onSubmit={handleFormSubmit}>
        <Flex gap={{ default: "gapMd" }} flexWrap={{ default: "wrap" }}>
          <FlexItem flex={{ default: "flex_2" }}>
            <FormGroup label="Bind Address (Host)" isRequired fieldId="cs-host">
              <TextInput
                id="cs-host"
                value={host}
                onChange={(_event, val) => setHost(val)}
                placeholder="127.0.0.1 or 0.0.0.0"
              />
            </FormGroup>
          </FlexItem>

          <FlexItem flex={{ default: "flex_1" }}>
            <FormGroup label="Port" isRequired fieldId="cs-port">
              <TextInput
                id="cs-port"
                type="number"
                value={port}
                onChange={(_event, val) => setPort(val)}
                placeholder="8080"
              />
            </FormGroup>
          </FlexItem>
        </Flex>

        <FormGroup label="Authentication" isRequired fieldId="cs-auth">
          <FormSelect
            id="cs-auth"
            value={auth}
            onChange={(_event, val) => setAuth(val)}
            aria-label="Authentication Type"
          >
            <FormSelectOption key="password" value="password" label="Password (Recommended)" />
            <FormSelectOption key="none" value="none" label="None (No Authentication)" />
          </FormSelect>
        </FormGroup>

        {auth === "password" && (
          <FormGroup label="Password" fieldId="cs-password">
            <InputGroup>
              <InputGroupItem isFill>
                <TextInput
                  id="cs-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(_event, val) => setPassword(val)}
                  placeholder="Enter custom password"
                />
              </InputGroupItem>
              <InputGroupItem>
                <Button
                  variant="control"
                  icon={showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                />
              </InputGroupItem>
            </InputGroup>
          </FormGroup>
        )}

        <FormGroup fieldId="cs-options">
          <Checkbox
            label="Enable Self-Signed SSL/TLS Certificate (cert: true)"
            isChecked={cert}
            onChange={(_event, checked) => setCert(checked)}
            id="cs-cert-checkbox"
          />
          <Checkbox
            label="Disable Telemetry reporting"
            isChecked={disableTelemetry}
            onChange={(_event, checked) => setDisableTelemetry(checked)}
            id="cs-telemetry-checkbox"
            style={{ marginTop: "0.5rem" }}
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};
