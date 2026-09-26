import React, { useState, useEffect } from "react";
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
  Checkbox,
} from "@patternfly/react-core";
import { SaveIcon, CheckCircleIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { SmbGlobal, NfsGlobal } from "../types";

interface SettingsViewProps {
  globalSettings: SmbGlobal;
  nfsGlobal?: NfsGlobal;
  ansibleBegin: string;
  ansibleEnd: string;
  versions?: {
    smb: string;
    nfs: string;
  };
  onSaveGlobal: (global: Record<string, string>) => Promise<void>;
  onSaveNfsGlobal?: (nfs: NfsGlobal) => Promise<void>;
  onSaveAnsibleMarkers: (begin: string, end: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  globalSettings,
  nfsGlobal,
  ansibleBegin,
  ansibleEnd,
  versions,
  onSaveGlobal,
  onSaveNfsGlobal,
  onSaveAnsibleMarkers,
}) => {
  const [workgroup, setWorkgroup] = useState(globalSettings.workgroup || "WORKGROUP");
  const [serverString, setServerString] = useState(globalSettings.server_string || "Samba Server");
  const [netbiosName, setNetbiosName] = useState(globalSettings.netbios_name || "");
  const [minProtocol, setMinProtocol] = useState(globalSettings.server_min_protocol || "SMB2_02");

  // NFS Global State
  const [nfsThreads, setNfsThreads] = useState<string>(
    nfsGlobal?.threads !== undefined ? String(nfsGlobal.threads) : "8"
  );
  const [nfsPort, setNfsPort] = useState<string>(
    nfsGlobal?.port !== undefined ? String(nfsGlobal.port) : ""
  );
  const [nfsGraceTime, setNfsGraceTime] = useState<string>(
    nfsGlobal?.grace_time !== undefined ? String(nfsGlobal.grace_time) : ""
  );
  const [nfsLeaseTime, setNfsLeaseTime] = useState<string>(
    nfsGlobal?.lease_time !== undefined ? String(nfsGlobal.lease_time) : ""
  );
  const [nfsVers3, setNfsVers3] = useState<boolean>(nfsGlobal?.vers3 !== false);
  const [nfsVers4, setNfsVers4] = useState<boolean>(nfsGlobal?.vers4 !== false);
  const [nfsVers41, setNfsVers41] = useState<boolean>(nfsGlobal?.vers4_1 !== false);
  const [nfsVers42, setNfsVers42] = useState<boolean>(nfsGlobal?.vers4_2 !== false);

  const [beginMarker, setBeginMarker] = useState(ansibleBegin);
  const [endMarker, setEndMarker] = useState(ansibleEnd);
  const [testComment, setTestComment] = useState("# <-- BEGIN ANSIBLE MANAGED storage_cluster CONFIG -->");

  const [loading, setLoading] = useState(false);
  const [nfsLoading, setNfsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (nfsGlobal) {
      setNfsThreads(nfsGlobal.threads !== undefined ? String(nfsGlobal.threads) : "8");
      setNfsPort(nfsGlobal.port !== undefined ? String(nfsGlobal.port) : "");
      setNfsGraceTime(nfsGlobal.grace_time !== undefined ? String(nfsGlobal.grace_time) : "");
      setNfsLeaseTime(nfsGlobal.lease_time !== undefined ? String(nfsGlobal.lease_time) : "");
      setNfsVers3(nfsGlobal.vers3 !== false);
      setNfsVers4(nfsGlobal.vers4 !== false);
      setNfsVers41(nfsGlobal.vers4_1 !== false);
      setNfsVers42(nfsGlobal.vers4_2 !== false);
    }
  }, [nfsGlobal]);

  useEffect(() => {
    setWorkgroup(globalSettings.workgroup || "WORKGROUP");
    setServerString(globalSettings.server_string || "Samba Server");
    setNetbiosName(globalSettings.netbios_name || "");
    setMinProtocol(globalSettings.server_min_protocol || "SMB2_02");
  }, [globalSettings]);

  useEffect(() => {
    setBeginMarker(ansibleBegin);
    setEndMarker(ansibleEnd);
  }, [ansibleBegin, ansibleEnd]);

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
      setErrorMsg(err.message || "Failed to save Samba settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNfs = async () => {
    if (!onSaveNfsGlobal) {
      return;
    }
    setNfsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const payload: NfsGlobal = {
        vers3: nfsVers3,
        vers4: nfsVers4,
        vers4_1: nfsVers41,
        vers4_2: nfsVers42,
      };
      if (nfsThreads.trim()) {
        payload.threads = parseInt(nfsThreads.trim(), 10) || 8;
      }
      if (nfsPort.trim()) {
        payload.port = parseInt(nfsPort.trim(), 10);
      }
      if (nfsGraceTime.trim()) {
        payload.grace_time = parseInt(nfsGraceTime.trim(), 10);
      }
      if (nfsLeaseTime.trim()) {
        payload.lease_time = parseInt(nfsLeaseTime.trim(), 10);
      }
      await onSaveNfsGlobal(payload);
      setSuccessMsg("Global NFS settings saved successfully");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save NFS settings");
    } finally {
      setNfsLoading(false);
    }
  };

  const handleSaveMarkers = () => {
    onSaveAnsibleMarkers(beginMarker.trim(), endMarker.trim());
    setSuccessMsg("Configuration marker patterns saved");
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

          {/* Card 2: Global NFS Configuration */}
          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>
                <Title headingLevel="h2" size="xl">Global NFS Configuration</Title>
              </CardTitle>
              <CardBody>
                <Form>
                  <FormGroup label="NFS Server Threads" fieldId="nfs-threads">
                    <TextInput
                      id="nfs-threads"
                      type="number"
                      value={nfsThreads}
                      onChange={(_event, val) => setNfsThreads(val)}
                      placeholder="8"
                    />
                  </FormGroup>

                  <FormGroup label="TCP/UDP Port (Default: 2049)" fieldId="nfs-port">
                    <TextInput
                      id="nfs-port"
                      type="number"
                      value={nfsPort}
                      onChange={(_event, val) => setNfsPort(val)}
                      placeholder="2049"
                    />
                  </FormGroup>

                  <Grid hasGutter>
                    <GridItem span={6}>
                      <FormGroup label="Grace Time (s)" fieldId="nfs-grace">
                        <TextInput
                          id="nfs-grace"
                          type="number"
                          value={nfsGraceTime}
                          onChange={(_event, val) => setNfsGraceTime(val)}
                          placeholder="90"
                        />
                      </FormGroup>
                    </GridItem>
                    <GridItem span={6}>
                      <FormGroup label="Lease Time (s)" fieldId="nfs-lease">
                        <TextInput
                          id="nfs-lease"
                          type="number"
                          value={nfsLeaseTime}
                          onChange={(_event, val) => setNfsLeaseTime(val)}
                          placeholder="90"
                        />
                      </FormGroup>
                    </GridItem>
                  </Grid>

                  <FormGroup label="Supported NFS Protocol Versions" fieldId="nfs-protocols">
                    <Flex gap={{ default: "gapMd" }}>
                      <Checkbox
                        id="nfs-v3"
                        label="NFSv3"
                        isChecked={nfsVers3}
                        onChange={(_event, checked) => setNfsVers3(checked)}
                      />
                      <Checkbox
                        id="nfs-v4"
                        label="NFSv4"
                        isChecked={nfsVers4}
                        onChange={(_event, checked) => setNfsVers4(checked)}
                      />
                      <Checkbox
                        id="nfs-v41"
                        label="NFSv4.1"
                        isChecked={nfsVers41}
                        onChange={(_event, checked) => setNfsVers41(checked)}
                      />
                      <Checkbox
                        id="nfs-v42"
                        label="NFSv4.2"
                        isChecked={nfsVers42}
                        onChange={(_event, checked) => setNfsVers42(checked)}
                      />
                    </Flex>
                  </FormGroup>

                  <div style={{ marginTop: "1.5rem" }}>
                    <Button
                      variant="primary"
                      icon={<SaveIcon />}
                      onClick={handleSaveNfs}
                      isLoading={nfsLoading}
                    >
                      Save NFS settings
                    </Button>
                  </div>
                </Form>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 3: Managed Configuration Markers */}
          <GridItem span={12} lg={6}>
            <Card isFullHeight>
              <CardTitle>
                <Title headingLevel="h2" size="xl">Managed Configuration Markers</Title>
              </CardTitle>
              <CardBody>
                <div style={{ color: "var(--zfs-text-secondary)", marginBottom: "1rem", fontSize: "0.9rem" }}>
                  Configure wildcard patterns to detect configuration sections managed by external automation or orchestration tools.
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

          {/* Card 4: About Cockpit File Sharing */}
          <GridItem span={12} lg={6}>
            <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", height: "100%" }}>
              <CardTitle>
                <Title headingLevel="h2" size="xl">About Cockpit File Sharing</Title>
              </CardTitle>
              <CardBody>
                <p style={{ marginBottom: "0.5rem" }}>
                  <strong>Version:</strong> {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.2.1"}
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
