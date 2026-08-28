import React, { useState, useEffect } from "react";
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Checkbox,
  Button,
  ActionGroup,
  Alert,
} from "@patternfly/react-core";
import { SystemInfo } from "../types";

interface SettingsViewProps {
  systemInfo: SystemInfo | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ systemInfo }) => {
  const [theme, setTheme] = useState(
    localStorage.getItem("cockpit_zfs_theme") || "auto"
  );
  const [enablePreview, setEnablePreview] = useState(
    localStorage.getItem("cockpit_zfs_preview") !== "false"
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Apply theme
    let isDark = false;
    if (theme === "dark") {
      isDark = true;
    } else if (theme === "light") {
      isDark = false;
    } else {
      const shellTheme = localStorage.getItem("shell:style") || "auto";
      isDark =
        shellTheme === "dark" ||
        (window.matchMedia?.("(prefers-color-scheme: dark)").matches &&
          shellTheme === "auto");
    }

    if (isDark) {
      document.documentElement.classList.add("pf-v5-theme-dark");
    } else {
      document.documentElement.classList.remove("pf-v5-theme-dark");
    }
  }, [theme]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("cockpit_zfs_theme", theme);
    localStorage.setItem("cockpit_zfs_preview", enablePreview ? "true" : "false");
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <PageSection variant="light">
        <Title headingLevel="h1" size="2xl">
          Plugin Preferences &amp; Settings
        </Title>
      </PageSection>

      <PageSection>
        {saved && (
          <Alert variant="success" title="Preferences Saved" style={{ marginBottom: "1rem" }} />
        )}

        <Card style={{ maxWidth: "650px", marginBottom: "1.5rem" }}>
          <CardTitle>Appearance &amp; Behavior</CardTitle>
          <CardBody>
            <Form onSubmit={handleSave}>
              <FormGroup label="Theme Preference" fieldId="theme-pref">
                <FormSelect
                  id="theme-pref"
                  value={theme}
                  onChange={(_event, val) => setTheme(val)}
                >
                  <FormSelectOption value="auto" label="Auto (Follow Cockpit Shell Theme)" />
                  <FormSelectOption value="light" label="Light Theme" />
                  <FormSelectOption value="dark" label="Dark Theme" />
                </FormSelect>
              </FormGroup>

              <FormGroup fieldId="enable-preview">
                <Checkbox
                  id="enable-preview"
                  label="Always show Shell Command Preview modal before executing commands"
                  isChecked={enablePreview}
                  onChange={(_event, checked) => setEnablePreview(checked)}
                />
              </FormGroup>

              <ActionGroup>
                <Button variant="primary" type="submit">
                  Save Preferences
                </Button>
              </ActionGroup>
            </Form>
          </CardBody>
        </Card>

        <Card style={{ maxWidth: "650px" }}>
          <CardTitle>About Cockpit ZFS</CardTitle>
          <CardBody>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Version:</strong> 1.0.0 (Open Source)
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>License:</strong> MIT / Free Software
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Host ZFS Version:</strong>{" "}
              <span style={{ fontFamily: "monospace" }}>
                {systemInfo?.version || "Unknown"}
              </span>
            </p>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};
