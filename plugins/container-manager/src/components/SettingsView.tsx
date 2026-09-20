import React, { useState, useEffect } from 'react';
import {
  PageSection,
  Card,
  CardTitle,
  CardBody,
  Grid,
  GridItem,
  Title,
  FormGroup,
  TextInput,
  Button,
  Flex,
  FlexItem,
  Alert,
  Tabs,
  Tab,
  TabTitleText,
  Tooltip,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import {
  LockIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { EnginesDetection, EngineType, TlsStatus } from '../types';
import { containerApi } from '../api/containerClient';

export interface SettingsViewProps {
  engines: EnginesDetection;
  activeEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  onOpenSystemPrune: () => void;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  engines,
  activeEngine,
  onSelectEngine,
  onOpenSystemPrune,
  onRefresh,
}) => {
  const [tlsStatus, setTlsStatus] = useState<TlsStatus | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [port, setPort] = useState<number>(2376);
  const [sansInput, setSansInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const hostIp = window.location.hostname || '127.0.0.1';

  const loadStatus = async () => {
    setError(null);
    try {
      const status = await containerApi.getTlsStatus(activeEngine);
      setTlsStatus(status);
      setPort(status.port || 2376);
      if (status.sans && status.sans.length > 0) {
        setSansInput(status.sans.join(', '));
      } else {
        setSansInput(`${hostIp}, localhost, 127.0.0.1`);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load TLS status');
    }
  };

  useEffect(() => {
    loadStatus();
  }, [activeEngine]);

  const handleSetup = async () => {
    setIsSettingUp(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const sans = sansInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const res = await containerApi.setupTls(activeEngine, port, sans);
      if (res?.status === 'error') {
        setError(res.error || 'Failed to configure TLS');
      } else {
        setSuccessMsg(`Remote TCP socket on port ${port} and mutual TLS certificates successfully configured.`);
        await loadStatus();
        onRefresh();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to configure TLS');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleDisable = async () => {
    setIsSettingUp(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await containerApi.disableTls(activeEngine);
      if (res?.status === 'error') {
        setError(res.error || 'Failed to disable TLS');
      } else {
        setSuccessMsg('Remote TCP socket disabled.');
        await loadStatus();
        onRefresh();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to disable TLS');
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleDownloadCerts = async () => {
    try {
      const bundle = await containerApi.getClientBundle(activeEngine);
      if (bundle.status === 'error') {
        setError(bundle.ca || 'Failed to get client certificate bundle');
        return;
      }

      const binaryString = window.atob(bundle.zipBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bundle.zipFilename || `${activeEngine}-client-certs.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Failed to download certificate bundle');
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isEnabled = tlsStatus?.enabled || false;
  const isPodman = activeEngine === 'podman';

  const sshContextCode = isPodman
    ? `podman system connection add remote-${hostIp} ssh://root@${hostIp}/run/podman/podman.sock\npodman system connection default remote-${hostIp}\npodman ps`
    : `docker context create remote-${hostIp} --docker "host=ssh://root@${hostIp}"\ndocker context use remote-${hostIp}\ndocker ps`;

  const tcpTlsContextCode = isPodman
    ? `podman system connection add remote-${hostIp} tcp://${hostIp}:${port}\npodman system connection default remote-${hostIp}\npodman ps`
    : `# Unzip client certificates to ~/.docker/certs/\ndocker context create remote-${hostIp} \\\n  --docker "host=tcp://${hostIp}:${port},ca=~/.docker/certs/ca.pem,cert=~/.docker/certs/cert.pem,key=~/.docker/certs/key.pem"\ndocker context use remote-${hostIp}\ndocker ps`;

  const envVarsCode = `export DOCKER_HOST="tcp://${hostIp}:${port}"\nexport DOCKER_TLS_VERIFY=1\nexport DOCKER_CERT_PATH="~/.docker/certs"\ndocker ps`;

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: '1rem' }}>
        <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0 }}>
          Container Settings
        </Title>
        <p style={{ color: '#8b949e', marginTop: '4px' }}>
          Configure container engine preferences, remote daemon listeners, and mutual TLS authentication.
        </p>
      </PageSection>

      <PageSection style={{ paddingTop: '1.5rem' }}>
        {error && (
          <Alert variant="danger" isInline title="Error" style={{ marginBottom: '1.25rem' }}>
            {error}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" isInline title="Success" style={{ marginBottom: '1.25rem' }}>
            {successMsg}
          </Alert>
        )}

        <Grid hasGutter>
          {/* Engine Selection Card */}
          <GridItem span={12} md={6}>
            <Card style={{ height: '100%' }}>
              <CardTitle>Container Engine Selection</CardTitle>
              <CardBody>
                <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '1rem' }}>
                  Choose which container daemon or CLI backend to use for managing containers and resources.
                </p>

                <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                      <strong>Docker Engine</strong>
                      <StatusBadge variant={engines.docker.installed ? (engines.docker.active ? 'green' : 'grey') : 'grey'}>
                        {engines.docker.installed ? (engines.docker.active ? 'Active' : 'Installed') : 'Not Installed'}
                      </StatusBadge>
                    </Flex>
                    {engines.docker.installed && (
                      <Button
                        variant={activeEngine === 'docker' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          onSelectEngine('docker');
                          setSuccessMsg('Active container backend switched to Docker Engine.');
                        }}
                      >
                        {activeEngine === 'docker' ? 'Active Backend' : 'Activate Docker'}
                      </Button>
                    )}
                  </Flex>

                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                      <strong>Podman</strong>
                      <StatusBadge variant={engines.podman.installed ? (engines.podman.active ? 'green' : 'grey') : 'grey'}>
                        {engines.podman.installed ? (engines.podman.active ? 'Active' : 'Installed') : 'Not Installed'}
                      </StatusBadge>
                    </Flex>
                    {engines.podman.installed && (
                      <Button
                        variant={activeEngine === 'podman' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          onSelectEngine('podman');
                          setSuccessMsg('Active container backend switched to Podman.');
                        }}
                      >
                        {activeEngine === 'podman' ? 'Active Backend' : 'Activate Podman'}
                      </Button>
                    )}
                  </Flex>
                </Flex>
              </CardBody>
            </Card>
          </GridItem>

          {/* Maintenance / System Prune Card */}
          <GridItem span={12} md={6}>
            <Card style={{ height: '100%' }}>
              <CardTitle>Maintenance &amp; Clean Up</CardTitle>
              <CardBody>
                <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '1rem' }}>
                  Reclaim disk space by purging stopped containers, dangling images, unused networks, and optional volumes.
                </p>

                <Button
                  variant="secondary"
                  icon={<TrashIcon />}
                  onClick={onOpenSystemPrune}
                  isDisabled={activeEngine === 'none'}
                >
                  Open System Prune Modal
                </Button>
              </CardBody>
            </Card>
          </GridItem>

          {/* Remote API & Mutual TLS Configuration Card */}
          <GridItem span={12}>
            <Card>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <LockIcon style={{ marginRight: '8px' }} />
                    Remote TCP Socket &amp; Mutual TLS
                  </FlexItem>
                  <FlexItem>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                      <StatusBadge variant={isEnabled ? 'green' : 'grey'}>
                        {isEnabled ? `TCP Enabled (Port ${port})` : 'TCP Disabled'}
                      </StatusBadge>
                      {tlsStatus?.certsExist && (
                        <StatusBadge variant="blue">Mutual TLS Configured</StatusBadge>
                      )}
                    </Flex>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '1.25rem' }}>
                  Securely expose the {activeEngine === 'docker' ? 'Docker' : 'Podman'} daemon over TCP using PKI Certificate Authority (CA), server certificate with Subject Alternative Names (SANs), and client certificates.
                </p>

                {isEnabled ? (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                      <Button
                        variant="primary"
                        icon={<DownloadIcon />}
                        onClick={handleDownloadCerts}
                        size="sm"
                      >
                        Download Client Certs (.zip)
                      </Button>
                      <Button
                        variant="danger"
                        onClick={handleDisable}
                        isLoading={isSettingUp}
                        isDisabled={isSettingUp}
                        size="sm"
                      >
                        Disable Remote TCP
                      </Button>
                    </Flex>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '1.25rem',
                      borderRadius: '6px',
                      border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                      Enable TCP Listener with Mutual TLS
                    </Title>

                    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
                      <FormGroup label="TCP Port" fieldId="port-input" isRequired>
                        <TextInput
                          id="port-input"
                          type="number"
                          value={port}
                          onChange={(_e, val) => setPort(Number(val))}
                          style={{ maxWidth: '150px' }}
                          isDisabled={isSettingUp}
                        />
                      </FormGroup>

                      <FormGroup
                        label="Subject Alternative Names (SANs)"
                        fieldId="sans-input"
                      >
                        <TextInput
                          id="sans-input"
                          value={sansInput}
                          onChange={(_e, val) => setSansInput(val)}
                          placeholder="192.168.40.142, docker.internal, localhost"
                          isDisabled={isSettingUp}
                        />
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem>
                              Comma-separated server IP addresses and hostnames that clients will use to connect.
                            </HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      </FormGroup>

                      <Button
                        variant="primary"
                        icon={<LockIcon />}
                        onClick={handleSetup}
                        isLoading={isSettingUp}
                        isDisabled={isSettingUp}
                        style={{ width: 'fit-content' }}
                      >
                        Generate Certificates &amp; Enable Remote TCP
                      </Button>
                    </Flex>
                  </div>
                )}

                <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                  Remote Connection Instructions
                </Title>

                <Tabs
                  activeKey={activeTab}
                  onSelect={(_e, key) => setActiveTab(Number(key))}
                  isBox
                  style={{ marginBottom: '1rem' }}
                >
                  <Tab eventKey={0} title={<TabTitleText>SSH Context (No Ports Opened)</TabTitleText>}>
                    <div style={{ padding: '1rem 0' }}>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                        Connect securely via native SSH tunneling using existing credentials/keys without exposing any TCP ports:
                      </p>
                      <div style={{ position: 'relative' }}>
                        <pre
                          style={{
                            padding: '1rem',
                            backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                            color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                            border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            overflowX: 'auto',
                          }}
                        >
                          <code>{sshContextCode}</code>
                        </pre>
                        <Tooltip content="Copy command">
                          <Button
                            variant="plain"
                            icon={copiedKey === 'ssh' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                            onClick={() => copyToClipboard(sshContextCode, 'ssh')}
                            aria-label="Copy code"
                            style={{ position: 'absolute', top: '8px', right: '8px' }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </Tab>

                  <Tab eventKey={1} title={<TabTitleText>TCP + Mutual TLS Context</TabTitleText>}>
                    <div style={{ padding: '1rem 0' }}>
                      <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                        Connect directly via TCP port {port} using the downloaded client certificate bundle:
                      </p>
                      <div style={{ position: 'relative' }}>
                        <pre
                          style={{
                            padding: '1rem',
                            backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                            color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                            border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            overflowX: 'auto',
                          }}
                        >
                          <code>{tcpTlsContextCode}</code>
                        </pre>
                        <Tooltip content="Copy command">
                          <Button
                            variant="plain"
                            icon={copiedKey === 'tcp' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                            onClick={() => copyToClipboard(tcpTlsContextCode, 'tcp')}
                            aria-label="Copy code"
                            style={{ position: 'absolute', top: '8px', right: '8px' }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </Tab>

                  {!isPodman && (
                    <Tab eventKey={2} title={<TabTitleText>Environment Variables</TabTitleText>}>
                      <div style={{ padding: '1rem 0' }}>
                        <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                          Configure standard CLI environment variables for automation or CI/CD pipelines:
                        </p>
                        <div style={{ position: 'relative' }}>
                          <pre
                            style={{
                              padding: '1rem',
                              backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                              color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                              border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                              borderRadius: '6px',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              overflowX: 'auto',
                            }}
                          >
                            <code>{envVarsCode}</code>
                          </pre>
                          <Tooltip content="Copy command">
                            <Button
                              variant="plain"
                              icon={copiedKey === 'env' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                              onClick={() => copyToClipboard(envVarsCode, 'env')}
                              aria-label="Copy code"
                              style={{ position: 'absolute', top: '8px', right: '8px' }}
                            />
                          </Tooltip>
                        </div>
                      </div>
                    </Tab>
                  )}
                </Tabs>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};
