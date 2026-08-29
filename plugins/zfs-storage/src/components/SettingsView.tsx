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
          <CardTitle>Appearance &amp; Behavior</CardTitle>
          <CardBody>
            <Form onSubmit={handleSave}>
              <FormGroup label="Theme" fieldId="theme-pref">
                <FormSelect
                  id="theme-pref"
                  value={theme}
                  onChange={(_event, val) => setTheme(val)}
                >
                  <FormSelectOption value="auto" label="Follow Cockpit shell style" />
                  <FormSelectOption value="light" label="Light" />
                  <FormSelectOption value="dark" label="Dark" />
                </FormSelect>
              </FormGroup>

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
              <strong>Version:</strong> 1.0.0 (Open Source)
            </p>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>License:</strong> MIT / Free Software
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
