import React, { useState } from "react";
import {
  PageSection,
  Title,
  Card,
  CardTitle,
  CardBody,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Button,
  Flex,
  FlexItem,
  Alert,
  Label,
  Grid,
  GridItem,
} from "@patternfly/react-core";
import { SaveIcon, CheckCircleIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { SmbGlobal } from "../types";

interface SettingsViewProps {
  globalSettings: SmbGlobal;
  ansibleBegin: string;
  ansibleEnd: string;
  versions?: {
    smb: string;
    nfs: string;
  };
  onSaveGlobal: (global: Record<string, string>) => Promise<void>;
  onSaveAnsibleMarkers: (begin: string, end: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  globalSettings,
  ansibleBegin,
  ansibleEnd,
  versions,
  onSaveGlobal,
  onSaveAnsibleMarkers,
}) => {
  const [workgroup, setWorkgroup] = useState(globalSettings.workgroup || "WORKGROUP");
  const [serverString, setServerString] = useState(globalSettings.server_string || "Samba Server");
  const [netbiosName, setNetbiosName] = useState(globalSettings.netbios_name || "");
  const [minProtocol, setMinProtocol] = useState(globalSettings.server_min_protocol || "SMB2_02");

  const [beginMarker, setBeginMarker] = useState(ansibleBegin);
  const [endMarker, setEndMarker] = useState(ansibleEnd);
  const [testComment, setTestComment] = useState("# <-- BEGIN ANSIBLE MANAGED storage_cluster CONFIG -->");

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveSamba = async () => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await onSaveGlobal({
        workgroup: workgroup.trim(),
        "server string": serverString.trim(),
        ...(netbiosName.trim() ? { "netbios name": netbiosName.trim() } : {}),
        "server min protocol": minProtocol,
      });
      setSuccessMsg("Global Samba settings saved successfully");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMarkers = () => {
    onSaveAnsibleMarkers(beginMarker.trim(), endMarker.trim());
    setSuccessMsg("Ansible marker patterns saved");
  };

  // Test regex match
  const getTestResult = () => {
    const esc = beginMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "(.*?)");
    const regex = new RegExp(`^${esc}$`, "i");
    const match = testComment.trim().match(regex);
    if (match) {
      return {
        matched: true,
        tag: match[1]?.trim() || "default",
      };
    }
    return { matched: false, tag: null };
  };

  const testResult = getTestResult();

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Settings &amp; Automation
            </Title>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {successMsg && (
          <Alert variant="success" title={successMsg} isInline style={{ marginBottom: "1.5rem" }} />
        )}
        {errorMsg && (
          <Alert variant="danger" title={errorMsg} isInline style={{ marginBottom: "1.5rem" }} />
        )}

        <Grid hasGutter>
          {/* Card 1: Global Samba Settings */}
          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>
                <Title headingLevel="h2" size="xl">Global Samba Configuration</Title>
              </CardTitle>
              <CardBody>
                <Form>
                  <FormGroup label="Workgroup Name" isRequired fieldId="set-workgroup">
                    <TextInput
                      id="set-workgroup"
                      value={workgroup}
                      onChange={(_event, val) => setWorkgroup(val)}
                      placeholder="WORKGROUP"
                    />
                  </FormGroup>

                  <FormGroup label="Server Description / String" fieldId="set-server-string">
                    <TextInput
                      id="set-server-string"
                      value={serverString}
                      onChange={(_event, val) => setServerString(val)}
                      placeholder="%h server (Samba)"
                    />
                  </FormGroup>

                  <FormGroup label="NetBIOS Name (Optional)" fieldId="set-netbios">
                    <TextInput
                      id="set-netbios"
                      value={netbiosName}
                      onChange={(_event, val) => setNetbiosName(val)}
                      placeholder="e.g. FILESERVER"
                    />
                  </FormGroup>

                  <FormGroup label="Minimum SMB Protocol" fieldId="set-min-proto">
                    <FormSelect
                      id="set-min-proto"
                      value={minProtocol}
                      onChange={(_event, val) => setMinProtocol(val)}
                    >
                      <FormSelectOption value="SMB2_02" label="SMB 2.0.2 (Default, secure)" />
                      <FormSelectOption value="SMB3" label="SMB 3.0 (Modern only)" />
                      <FormSelectOption value="NT1" label="SMB 1.0 / NT1 (Legacy, insecure)" />
                    </FormSelect>
                  </FormGroup>

                  <div style={{ marginTop: "1.5rem" }}>
                    <Button
                      variant="primary"
                      icon={<SaveIcon />}
                      onClick={handleSaveSamba}
                      isLoading={loading}
                    >
                      Save Samba settings
                    </Button>
                  </div>
                </Form>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 2: Wildcard Ansible Markers */}
          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>
                <Title headingLevel="h2" size="xl">Ansible Managed Block Markers</Title>
              </CardTitle>
              <CardBody>
                <div style={{ color: "var(--zfs-text-secondary)", marginBottom: "1rem", fontSize: "0.9rem" }}>
                  Configure wildcard patterns to detect configuration sections managed by Ansible automation.
                  Any shares inside matched blocks are locked as read-only.
                </div>

                <Form>
                  <FormGroup label="Begin Block Pattern (supports * wildcard)" isRequired fieldId="ansible-begin">
                    <TextInput
                      id="ansible-begin"
                      value={beginMarker}
                      onChange={(_event, val) => setBeginMarker(val)}
                      placeholder="# <-- BEGIN ANSIBLE MANAGED * CONFIG -->"
                    />
                  </FormGroup>

                  <FormGroup label="End Block Pattern (supports * wildcard)" isRequired fieldId="ansible-end">
                    <TextInput
                      id="ansible-end"
                      value={endMarker}
                      onChange={(_event, val) => setEndMarker(val)}
                      placeholder="# <-- END ANSIBLE MANAGED * CONFIG -->"
                    />
                  </FormGroup>

                  <FormGroup label="Test Pattern Sandbox" fieldId="ansible-test" style={{ marginTop: "1rem" }}>
                    <TextInput
                      id="ansible-test"
                      value={testComment}
                      onChange={(_event, val) => setTestComment(val)}
                    />
                    <div style={{ marginTop: 8 }}>
                      {testResult.matched ? (
                        <Label color="green" icon={<CheckCircleIcon />}>
                          Matched! Extracted tag: "{testResult.tag}"
                        </Label>
                      ) : (
                        <Label color="red" icon={<ExclamationCircleIcon />}>
                          Does not match begin pattern
                        </Label>
                      )}
                    </div>
                  </FormGroup>

                  <div style={{ marginTop: "1.5rem" }}>
                    <Button variant="secondary" onClick={handleSaveMarkers}>
                      Apply marker patterns
                    </Button>
                  </div>
                </Form>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 3: About Cockpit File Sharing */}
          <GridItem span={12}>
            <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", marginTop: "1rem" }}>
              <CardTitle>
                <Title headingLevel="h2" size="xl">About Cockpit File Sharing</Title>
              </CardTitle>
              <CardBody>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Version:</strong> 0.1.0
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>License:</strong> MIT
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Host Samba:</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>{versions?.smb || "Samba"}</span>
                </p>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Host NFS:</strong>{" "}
                  <span style={{ fontFamily: "monospace" }}>{versions?.nfs || "NFS Server"}</span>
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};
