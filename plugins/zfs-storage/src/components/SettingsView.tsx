import React, { useState } from "react";
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  Checkbox,
  Button,
  Alert,
} from "@patternfly/react-core";
import { SystemInfo } from "../types";

interface SettingsViewProps {
  systemInfo: SystemInfo | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ systemInfo }) => {
  const [enablePreview, setEnablePreview] = useState(
    localStorage.getItem("cockpit_zfs_preview") !== "false"
  );
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("cockpit_zfs_preview", enablePreview ? "true" : "false");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600 }}>
          Plugin Settings
        </Title>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {saved && (
          <Alert variant="success" isInline title="Preferences saved" style={{ marginBottom: "1.5rem" }} />
        )}

        <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", maxWidth: "650px", marginBottom: "1.5rem" }}>
          <CardTitle>Behavior</CardTitle>
          <CardBody>
            <Form onSubmit={handleSave}>
              <FormGroup fieldId="enable-preview" style={{ marginBottom: "0.75rem" }}>
                <Checkbox
                  id="enable-preview"
                  label="Show command preview modal before executing changes"
                  isChecked={enablePreview}
                  onChange={(_event, checked) => setEnablePreview(checked)}
                />
              </FormGroup>

              <div style={{ marginTop: "1rem" }}>
                <Button variant="primary" type="submit">
                  Save preferences
                </Button>
              </div>
            </Form>
          </CardBody>
        </Card>

        <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", maxWidth: "650px" }}>
          <CardTitle>About Cockpit ZFS</CardTitle>
          <CardBody>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Version:</strong> 0.5.0
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>License:</strong> MIT
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Host OpenZFS:</strong>{" "}
              <span style={{ fontFamily: "monospace" }}>
                {systemInfo?.version ? systemInfo.version.split("\n")[0] : "zfs"}
              </span>
            </p>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};
