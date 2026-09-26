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
  Modal,
  ModalVariant,
} from '@patternfly/react-core';
import {
  LockIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  TrashIcon,
  EyeIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { EnginesDetection, EngineType, TlsStatus, ClientCertBundle } from '../types';
import { containerApi } from '../api/containerClient';

enum PayloadEncoding {
  Text = 'text',
  Base64 = 'base64',
}

const REVOKE_DELAY_MS = 1000;
const COPIED_RESET_MS = 2000;
const DEFAULT_TLS_PORT = 2376;

export interface SettingsViewProps {
  engines: EnginesDetection;
  activeEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  onOpenSystemPrune: () => void;
  onRefresh: () => void;
  onNotify?: (variant: 'success' | 'danger' | 'warning' | 'info', title: string, message?: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  engines,
  activeEngine,
  onSelectEngine,
  onOpenSystemPrune,
  onRefresh,
  onNotify,
}) => {
  const [tlsStatus, setTlsStatus] = useState<TlsStatus | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [port, setPort] = useState<number>(DEFAULT_TLS_PORT);
  const [sansInput, setSansInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certBundle, setCertBundle] = useState<ClientCertBundle | null>(null);
  const [certTab, setCertTab] = useState<number>(0);
  const [loadingCerts, setLoadingCerts] = useState(false);

  const hostIp = (window.location.hostname ? window.location.hostname.split('.')[0] : '') || 'localhost';

  const loadStatus = async () => {
    setError(null);
    try {
      const status = await containerApi.getTlsStatus(activeEngine);
      setTlsStatus(status);
      setPort(status.port || DEFAULT_TLS_PORT);
      if (status.sans && status.sans.length > 0) {
        setSansInput(status.sans.join(', '));
      } else {
        const hName = status.hostname || hostIp;
        setSansInput(`${hName}, localhost, 127.0.0.1`);
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
    try {
      const sans = sansInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const res = await containerApi.setupTls(activeEngine, port, sans);
      if (res?.status === 'error') {
        const msg = res.error || 'Failed to configure TLS';
        setError(msg);
        onNotify?.('danger', 'TLS Configuration Failed', msg);
      } else {
        onNotify?.('success', 'TLS Configured', `Remote TCP socket on port ${port} and mutual TLS certificates configured.`);
        await loadStatus();
        onRefresh();
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to configure TLS';
      setError(msg);
      onNotify?.('danger', 'TLS Configuration Failed', msg);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleDisable = async () => {
    setIsSettingUp(true);
    setError(null);
    try {
      const res = await containerApi.disableTls(activeEngine);
      if (res?.status === 'error') {
        const msg = res.error || 'Failed to disable TLS';
        setError(msg);
        onNotify?.('danger', 'Disable Failed', msg);
      } else {
        onNotify?.('success', 'TLS Disabled', 'Remote TCP socket disabled.');
        await loadStatus();
        onRefresh();
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to disable TLS';
      setError(msg);
      onNotify?.('danger', 'Disable Failed', msg);
    } finally {
      setIsSettingUp(false);
    }
  };

  const downloadBlob = (
    content: string,
    filename: string,
    mimeType: string,
    encoding: PayloadEncoding = PayloadEncoding.Text
  ) => {
    let blob: Blob;
    if (encoding === PayloadEncoding.Base64) {
      const byteCharacters = atob(content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray], { type: mimeType });
    } else {
      blob = new Blob([content], { type: mimeType });
    }

    let targetDoc: Document = document;
    try {
      if (window.parent && window.parent.document && window.parent.document.body) {
        targetDoc = window.parent.document;
      }
    } catch {
      targetDoc = document;
    }

    const url = URL.createObjectURL(blob);
    const a = targetDoc.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    targetDoc.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        targetDoc.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Ignore cleanup errors
      }
    }, REVOKE_DELAY_MS);
  };

  const fetchBundle = async (): Promise<ClientCertBundle | null> => {
    try {
      const bundle = await containerApi.getClientBundle(activeEngine);
      if (bundle.status === 'error') {
        const msg = bundle.ca || 'Failed to get client certificate bundle';
        setError(msg);
        onNotify?.('danger', 'Certificates Failed', msg);
        return null;
      }
      setCertBundle(bundle);
      return bundle;
    } catch (e: any) {
      const msg = e?.message || 'Failed to fetch certificate bundle';
      setError(msg);
      onNotify?.('danger', 'Certificates Failed', msg);
      return null;
    }
  };

  const handleDownloadCerts = async () => {
    try {
      const bundle = certBundle || (await fetchBundle());
      if (!bundle) {
        return;
      }

      downloadBlob(
        bundle.zipBase64,
        bundle.zipFilename || `${activeEngine}-client-certs.zip`,
        'application/zip',
        PayloadEncoding.Base64
      );
      onNotify?.('success', 'Download Started', `Downloaded ${bundle.zipFilename || 'client certificates'}`);
    } catch (e: any) {
      const msg = e?.message || 'Failed to download certificate bundle';
      setError(msg);
      onNotify?.('danger', 'Download Failed', msg);
    }
  };

  const handleOpenCertViewer = async () => {
    setLoadingCerts(true);
    setIsCertModalOpen(true);
    try {
      await fetchBundle();
    } finally {
      setLoadingCerts(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, COPIED_RESET_MS);
  };

  const isEnabled = tlsStatus?.enabled || false;
  const isPodman = activeEngine === 'podman';

  const effectiveHost = tlsStatus?.hostname || hostIp;
  const effectiveUser = tlsStatus?.user || 'user';

  const sshContextCode = isPodman
    ? `podman system connection add remote-${effectiveHost} ssh://${effectiveUser}@${effectiveHost}/run/podman/podman.sock\npodman system connection default remote-${effectiveHost}\npodman ps`
    : `docker context create remote-${effectiveHost} --docker "host=ssh://${effectiveUser}@${effectiveHost}"\ndocker context use remote-${effectiveHost}\ndocker ps`;

  const tcpTlsContextCode = isPodman
    ? `podman system connection add remote-${effectiveHost} tcp://${effectiveHost}:${port}\npodman system connection default remote-${effectiveHost}\npodman ps`
    : `# Unzip client certificates to ~/.docker/certs/\ndocker context create remote-${effectiveHost} \\\n  --docker "host=tcp://${effectiveHost}:${port},ca=~/.docker/certs/ca.pem,cert=~/.docker/certs/cert.pem,key=~/.docker/certs/key.pem"\ndocker context use remote-${effectiveHost}\ndocker ps`;

  const envVarsCode = `export DOCKER_HOST="tcp://${effectiveHost}:${port}"\nexport DOCKER_TLS_VERIFY=1\nexport DOCKER_CERT_PATH="~/.docker/certs"\ndocker ps`;

  const installedEnginesCount = (engines.docker.installed ? 1 : 0) + (engines.podman.installed ? 1 : 0);

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
                    {engines.docker.installed && installedEnginesCount > 1 && (
                      <Button
                        variant={activeEngine === 'docker' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          onSelectEngine('docker');
                          onNotify?.('success', 'Backend Switched', 'Active container backend switched to Docker Engine.');
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
                    {engines.podman.installed && installedEnginesCount > 1 && (
                      <Button
                        variant={activeEngine === 'podman' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => {
                          onSelectEngine('podman');
                          onNotify?.('success', 'Backend Switched', 'Active container backend switched to Podman.');
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
                        variant="secondary"
                        icon={<EyeIcon />}
                        onClick={handleOpenCertViewer}
                        size="sm"
                      >
                        View Certificates
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
                        icon={isSettingUp ? undefined : <LockIcon />}
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

          {/* Card: About Cockpit Container Manager */}
          <GridItem span={12}>
            <Card isPlain style={{ border: '1px solid var(--zfs-card-border, #30363d)', marginTop: '0.5rem' }}>
              <CardTitle>
                <Title headingLevel="h2" size="xl">About Cockpit Container Manager</Title>
              </CardTitle>
              <CardBody>
                <p style={{ marginBottom: '0.5rem' }}>
                  <strong>Version:</strong> {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.1'}
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  <strong>License:</strong> MIT
                </p>
                {engines.docker.installed && (
                  <p style={{ marginBottom: '0.5rem' }}>
                    <strong>Docker Engine:</strong>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{engines.docker.version || 'Installed'}</span>
                  </p>
                )}
                {engines.podman.installed && (
                  <p style={{ marginBottom: '0.5rem' }}>
                    <strong>Podman:</strong>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{engines.podman.version || 'Installed'}</span>
                  </p>
                )}
              </CardBody>
            </Card>
          </GridItem>
        </Grid>
      </PageSection>

      {/* Certificate Viewer Modal */}
      <Modal
        variant={ModalVariant.large}
        title="Client Certificates &amp; Keys"
        isOpen={isCertModalOpen}
        onClose={() => setIsCertModalOpen(false)}
        actions={[
          <Button
            key="download-all"
            variant="primary"
            icon={<DownloadIcon />}
            onClick={handleDownloadCerts}
          >
            Download Bundle (.zip)
          </Button>,
          <Button key="close" variant="link" onClick={() => setIsCertModalOpen(false)}>
            Close
          </Button>,
        ]}
      >
        <p style={{ fontSize: '0.9rem', color: '#8b949e', marginBottom: '1rem' }}>
          Inspect or copy individual certificate files for client authentication.
        </p>

        {loadingCerts ? (
          <p>Loading certificate bundle...</p>
        ) : certBundle ? (
          <div>
            <Tabs
              activeKey={certTab}
              onSelect={(_e, key) => setCertTab(Number(key))}
              isBox
              style={{ marginBottom: '1rem' }}
            >
              <Tab eventKey={0} title={<TabTitleText>CA Certificate (ca.pem)</TabTitleText>}>
                <div style={{ position: 'relative', marginTop: '1rem' }}>
                  <pre
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '1rem',
                      backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                      color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                      border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                    }}
                  >
                    <code>{certBundle.ca}</code>
                  </pre>
                  <Flex style={{ marginTop: '0.5rem' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={copiedKey === 'ca' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                      onClick={() => copyToClipboard(certBundle.ca, 'ca')}
                    >
                      {copiedKey === 'ca' ? 'Copied!' : 'Copy ca.pem'}
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      icon={<DownloadIcon />}
                      onClick={() => downloadBlob(certBundle.ca, 'ca.pem', 'application/x-pem-file')}
                    >
                      Download ca.pem
                    </Button>
                  </Flex>
                </div>
              </Tab>

              <Tab eventKey={1} title={<TabTitleText>Client Certificate (cert.pem)</TabTitleText>}>
                <div style={{ position: 'relative', marginTop: '1rem' }}>
                  <pre
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '1rem',
                      backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                      color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                      border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                    }}
                  >
                    <code>{certBundle.cert}</code>
                  </pre>
                  <Flex style={{ marginTop: '0.5rem' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={copiedKey === 'cert' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                      onClick={() => copyToClipboard(certBundle.cert, 'cert')}
                    >
                      {copiedKey === 'cert' ? 'Copied!' : 'Copy cert.pem'}
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      icon={<DownloadIcon />}
                      onClick={() => downloadBlob(certBundle.cert, 'cert.pem', 'application/x-pem-file')}
                    >
                      Download cert.pem
                    </Button>
                  </Flex>
                </div>
              </Tab>

              <Tab eventKey={2} title={<TabTitleText>Client Key (key.pem)</TabTitleText>}>
                <div style={{ position: 'relative', marginTop: '1rem' }}>
                  <pre
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      padding: '1rem',
                      backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                      color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                      border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                    }}
                  >
                    <code>{certBundle.key}</code>
                  </pre>
                  <Flex style={{ marginTop: '0.5rem' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={copiedKey === 'key' ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                      onClick={() => copyToClipboard(certBundle.key, 'key')}
                    >
                      {copiedKey === 'key' ? 'Copied!' : 'Copy key.pem'}
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      icon={<DownloadIcon />}
                      onClick={() => downloadBlob(certBundle.key, 'key.pem', 'application/x-pem-file')}
                    >
                      Download key.pem
                    </Button>
                  </Flex>
                </div>
              </Tab>
            </Tabs>
          </div>
        ) : (
          <p>No certificates available.</p>
        )}
      </Modal>
    </>
  );
};

