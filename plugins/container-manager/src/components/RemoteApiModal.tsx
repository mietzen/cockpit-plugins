import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  TextInput,
  FormGroup,
  Alert,
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem,
  Card,
  CardBody,
  Tooltip,
  Title,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import {
  LockIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { TlsStatus, EngineType } from '../types';
import { containerApi } from '../api/containerClient';

export interface RemoteApiModalProps {
  isOpen: boolean;
  activeEngine: EngineType;
  onClose: () => void;
}

export const RemoteApiModal: React.FC<RemoteApiModalProps> = ({
  isOpen,
  activeEngine,
  onClose,
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
    if (isOpen) {
      loadStatus();
      setSuccessMsg(null);
    }
  }, [isOpen, activeEngine]);

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

      // Trigger base64 zip download
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

  if (!isOpen) {
    return null;
  }

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
    <Modal
      variant={ModalVariant.large}
      title="Remote API & TLS Configuration"
      isOpen={isOpen}
      onClose={onClose}
      appendTo={() => document.body}
      actions={[
        <Button key="close" variant="secondary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      {error && (
        <Alert variant="danger" isInline title="Error" style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" isInline title="Success" style={{ marginBottom: '1rem' }}>
          {successMsg}
        </Alert>
      )}

      <Card style={{ marginBottom: '1.25rem' }}>
        <CardBody>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>TCP Socket Status:</span>
                <StatusBadge variant={isEnabled ? 'green' : 'grey'}>
                  {isEnabled ? `Enabled (Port ${port})` : 'Disabled'}
                </StatusBadge>
                {tlsStatus?.certsExist && (
                  <StatusBadge variant="blue">Mutual TLS Configured</StatusBadge>
                )}
              </Flex>
              {tlsStatus?.expiry && (
                <div style={{ fontSize: '0.85rem', color: '#8b949e', marginTop: '4px' }}>
                  Certificate validity: {tlsStatus.expiry}
                </div>
              )}
            </FlexItem>

            <FlexItem>
              {isEnabled && (
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
              )}
            </FlexItem>
          </Flex>
        </CardBody>
      </Card>

      {!isEnabled ? (
        <div
          style={{
            padding: '1.25rem',
            borderRadius: '6px',
            border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
            marginBottom: '1.5rem',
          }}
        >
          <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
            Enable TCP Listener with Mutual TLS Authentication
          </Title>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#8b949e' }}>
            Generates a dedicated Certificate Authority (CA), Server certificate with Subject Alternative Names (SANs),
            and Client certificates, then securely configures the daemon listener via systemd.
          </p>

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
              Generate Certificates & Enable Remote TCP
            </Button>
          </Flex>
        </div>
      ) : null}

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
      </Tabs>
    </Modal>
  );
};
