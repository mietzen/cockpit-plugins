import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Flex,
  FlexItem,
  Card,
  CardBody,
  Title,
  TextInput,
  Tabs,
  Tab,
  TabTitleText,
  Tooltip,
  Alert,
} from '@patternfly/react-core';
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@patternfly/react-table';
import {
  CopyIcon,
  CheckIcon,
  InfoCircleIcon,
  ServerIcon,
  HddIcon,
  CodeIcon,
  TagIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { containerApi } from '../api/containerClient';
import { EngineType } from '../types';

export interface InspectModalProps {
  isOpen: boolean;
  kind: 'container' | 'image' | 'volume' | 'network';
  id: string;
  name?: string;
  activeEngine: EngineType;
  onClose: () => void;
}

export const InspectModal: React.FC<InspectModalProps> = ({
  isOpen,
  kind,
  id,
  name,
  activeEngine,
  onClose,
}) => {
  const [data, setData] = useState<any>(null);
  const [rawText, setRawText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [envFilter, setEnvFilter] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && id) {
      setLoading(true);
      setError(null);
      setData(null);
      setRawText('');
      setEnvFilter('');
      setActiveTab(0);

      containerApi
        .inspectEntity(kind, id, activeEngine)
        .then((res) => {
          if (res.status === 'error') {
            setError(res.error || 'Failed to inspect entity');
          } else {
            setData(res.data || {});
            setRawText(res.raw ? (typeof res.raw === 'string' ? res.raw : JSON.stringify(res.raw, null, 2)) : JSON.stringify(res.data || {}, null, 2));
          }
        })
        .catch((err) => {
          setError(err?.message || String(err));
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, kind, id, activeEngine]);

  const handleCopy = () => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const titleName = name || id;

  // Extract common properties
  const config = data?.Config || data?.config || {};
  const stateObj = data?.State || data?.state || {};
  const stateStr = (typeof stateObj === 'string' ? stateObj : stateObj?.Status || stateObj?.status || '').toLowerCase() || 'unknown';
  const isRunning = stateStr === 'running';

  const networkSettings = data?.NetworkSettings || data?.networkSettings || {};
  const networksObj = networkSettings?.Networks || networkSettings?.networks || {};
  const ipAddress = networkSettings?.IPAddress || networkSettings?.ipAddress || (Object.values(networksObj)[0] as any)?.IPAddress || '--';

  const portsObj = networkSettings?.Ports || networkSettings?.ports || {};
  const portRows: { containerPort: string; hostMapping: string }[] = [];
  if (portsObj && typeof portsObj === 'object') {
    Object.entries(portsObj).forEach(([cPort, mappings]) => {
      if (Array.isArray(mappings) && mappings.length > 0) {
        mappings.forEach((m: any) => {
          portRows.push({
            containerPort: cPort,
            hostMapping: `${m.HostIp || '0.0.0.0'}:${m.HostPort || ''}`,
          });
        });
      } else {
        portRows.push({ containerPort: cPort, hostMapping: 'none' });
      }
    });
  }

  // Mounts & Volumes
  const mounts = data?.Mounts || data?.mounts || [];

  // Environment variables
  const envList: string[] = config?.Env || config?.env || [];
  const filteredEnv = envList.filter((e) => e.toLowerCase().includes(envFilter.toLowerCase()));

  // Labels
  const labels = config?.Labels || config?.labels || data?.Labels || data?.labels || {};
  const labelEntries = Object.entries(labels);

  // Command & Entrypoint
  const cmdList = config?.Cmd || config?.cmd || [];
  const cmdStr = Array.isArray(cmdList) ? cmdList.join(' ') : String(cmdList || '');
  const entrypointList = config?.Entrypoint || config?.entrypoint || [];
  const entrypointStr = Array.isArray(entrypointList) ? entrypointList.join(' ') : String(entrypointList || '');
  const workDir = config?.WorkingDir || config?.workingDir || '/';

  // Restart Policy
  const hostConfig = data?.HostConfig || data?.hostConfig || {};
  const restartPolicyObj = hostConfig?.RestartPolicy || hostConfig?.restartPolicy || data?.RestartPolicy || {};
  const restartPolicyName = restartPolicyObj?.Name || restartPolicyObj?.name || (typeof restartPolicyObj === 'string' ? restartPolicyObj : '') || 'no';
  const restartPolicyRetries = restartPolicyObj?.MaximumRetryCount || restartPolicyObj?.maximumRetryCount;
  const restartPolicyStr = restartPolicyRetries ? `${restartPolicyName} (max retries: ${restartPolicyRetries})` : restartPolicyName;

  return (
    <Modal
      variant={ModalVariant.large}
      title={`Inspect: ${titleName}`}
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
        <Alert variant="danger" isInline title="Inspection Error" style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
          Loading inspection data...
        </div>
      ) : (
        <>
          {/* Header Summary Card */}
          <Card style={{ marginBottom: '1.25rem' }}>
            <CardBody>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'wrap' }}>
                <FlexItem>
                  <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <Title headingLevel="h3" size="lg" style={{ margin: 0, marginRight: '8px' }}>
                      {titleName}
                    </Title>
                    {kind === 'container' && (
                      <StatusBadge variant={isRunning ? 'green' : 'grey'}>
                        {stateStr.toUpperCase()}
                      </StatusBadge>
                    )}
                  </Flex>
                  <div style={{ fontSize: '0.85rem', color: '#8b949e', marginTop: '4px' }}>
                    ID: <code>{id}</code>
                  </div>
                </FlexItem>

                {data?.Image && (
                  <FlexItem>
                    <span style={{ fontSize: '0.85rem', color: '#8b949e' }}>Image: </span>
                    <strong style={{ fontSize: '0.9rem' }}>{String(data.Image)}</strong>
                  </FlexItem>
                )}
              </Flex>
            </CardBody>
          </Card>

          <div style={{ minHeight: '420px', maxHeight: '420px', height: '420px', overflowY: 'auto', paddingRight: '4px' }}>
            <Tabs
              activeKey={activeTab}
              onSelect={(_e, key) => setActiveTab(Number(key))}
              isBox
              style={{ marginBottom: '1rem' }}
            >
            <Tab eventKey={0} title={<TabTitleText><InfoCircleIcon style={{ marginRight: '6px' }} /> Overview &amp; Execution</TabTitleText>}>
              <div style={{ padding: '1rem 0' }}>
                <Table variant="compact" aria-label="Overview Properties">
                  <Tbody>
                    <Tr>
                      <Td style={{ width: '200px', fontWeight: 600 }}>Created</Td>
                      <Td>{data?.Created || data?.created || '--'}</Td>
                    </Tr>
                    {kind === 'container' && (
                      <>
                        <Tr>
                          <Td style={{ fontWeight: 600 }}>Restart Policy</Td>
                          <Td><code>{restartPolicyStr}</code></Td>
                        </Tr>
                        <Tr>
                          <Td style={{ fontWeight: 600 }}>IP Address</Td>
                          <Td><code>{ipAddress}</code></Td>
                        </Tr>
                        <Tr>
                          <Td style={{ fontWeight: 600 }}>Working Directory</Td>
                          <Td><code>{workDir}</code></Td>
                        </Tr>
                        <Tr>
                          <Td style={{ fontWeight: 600 }}>Entrypoint</Td>
                          <Td><code>{entrypointStr || 'none'}</code></Td>
                        </Tr>
                        <Tr>
                          <Td style={{ fontWeight: 600 }}>Command</Td>
                          <Td><code>{cmdStr || 'none'}</code></Td>
                        </Tr>
                      </>
                    )}
                    {data?.Size && (
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Size</Td>
                        <Td>{typeof data.Size === 'number' ? `${(data.Size / (1024 * 1024)).toFixed(1)} MB` : String(data.Size)}</Td>
                      </Tr>
                    )}
                    {data?.Driver && (
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Driver</Td>
                        <Td>{String(data.Driver)}</Td>
                      </Tr>
                    )}
                    {data?.Mountpoint && (
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Mountpoint</Td>
                        <Td><code>{String(data.Mountpoint)}</code></Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </div>
            </Tab>

            {kind === 'container' && (
              <Tab eventKey={1} title={<TabTitleText><ServerIcon style={{ marginRight: '6px' }} /> Networking &amp; Ports</TabTitleText>}>
                <div style={{ padding: '1rem 0' }}>
                  <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                    Port Mappings
                  </Title>
                  {portRows.length > 0 ? (
                    <Table variant="compact" aria-label="Ports Table" style={{ marginBottom: '1.25rem' }}>
                      <Thead>
                        <Tr>
                          <Th>Container Port</Th>
                          <Th>Host Binding</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {portRows.map((p, idx) => (
                          <Tr key={idx}>
                            <Td><code>{p.containerPort}</code></Td>
                            <Td><code>{p.hostMapping}</code></Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  ) : (
                    <p style={{ color: '#8b949e', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                      No published ports.
                    </p>
                  )}

                  <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                    Connected Networks
                  </Title>
                  {Object.keys(networksObj).length > 0 ? (
                    <Table variant="compact" aria-label="Networks Table">
                      <Thead>
                        <Tr>
                          <Th>Network Name</Th>
                          <Th>IP Address</Th>
                          <Th>Gateway</Th>
                          <Th>MAC Address</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {Object.entries(networksObj).map(([nName, nVal]: [string, any]) => (
                          <Tr key={nName}>
                            <Td><strong>{nName}</strong></Td>
                            <Td><code>{nVal?.IPAddress || '--'}</code></Td>
                            <Td><code>{nVal?.Gateway || '--'}</code></Td>
                            <Td><code>{nVal?.MacAddress || '--'}</code></Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  ) : (
                    <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>
                      No connected networks.
                    </p>
                  )}
                </div>
              </Tab>
            )}

            {kind === 'container' && (
              <Tab eventKey={2} title={<TabTitleText><HddIcon style={{ marginRight: '6px' }} /> Mounts &amp; Volumes</TabTitleText>}>
                <div style={{ padding: '1rem 0' }}>
                  {mounts.length > 0 ? (
                    <Table variant="compact" aria-label="Mounts Table">
                      <Thead>
                        <Tr>
                          <Th>Type</Th>
                          <Th>Source / Volume</Th>
                          <Th>Destination</Th>
                          <Th>Mode</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {mounts.map((m: any, idx: number) => (
                          <Tr key={idx}>
                            <Td><StatusBadge variant="blue">{m.Type || m.type || 'mount'}</StatusBadge></Td>
                            <Td><code>{m.Name || m.Source || m.source || '--'}</code></Td>
                            <Td><code>{m.Destination || m.destination || '--'}</code></Td>
                            <Td>{m.RW || m.rw ? 'Read/Write' : 'Read-Only'}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  ) : (
                    <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>
                      No storage volumes or bind mounts attached.
                    </p>
                  )}
                </div>
              </Tab>
            )}

            {envList.length > 0 && (
              <Tab eventKey={3} title={<TabTitleText><CodeIcon style={{ marginRight: '6px' }} /> Environment ({envList.length})</TabTitleText>}>
                <div style={{ padding: '1rem 0' }}>
                  <div style={{ marginBottom: '0.75rem', maxWidth: '300px' }}>
                    <TextInput
                      placeholder="Filter environment variables..."
                      value={envFilter}
                      onChange={(_e, val) => setEnvFilter(val)}
                      aria-label="Filter environment"
                    />
                  </div>
                  <div
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                      border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    }}
                  >
                    {filteredEnv.length > 0 ? (
                      filteredEnv.map((e, idx) => (
                        <div key={idx} style={{ padding: '2px 0', wordBreak: 'break-all' }}>
                          <code>{e}</code>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: '#8b949e' }}>No matching environment variables.</span>
                    )}
                  </div>
                </div>
              </Tab>
            )}

            {labelEntries.length > 0 && (
              <Tab eventKey={4} title={<TabTitleText><TagIcon style={{ marginRight: '6px' }} /> Labels ({labelEntries.length})</TabTitleText>}>
                <div style={{ padding: '1rem 0' }}>
                  <Table variant="compact" aria-label="Labels Table">
                    <Thead>
                      <Tr>
                        <Th style={{ width: '35%' }}>Key</Th>
                        <Th>Value</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {labelEntries.map(([k, v]) => (
                        <Tr key={k}>
                          <Td><code>{k}</code></Td>
                          <Td style={{ wordBreak: 'break-all' }}>{String(v)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </Tab>
            )}

            <Tab eventKey={5} title={<TabTitleText><CodeIcon style={{ marginRight: '6px' }} /> Raw Specification</TabTitleText>}>
              <div style={{ padding: '1rem 0', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '24px', right: '12px', zIndex: 10 }}>
                  <Tooltip content="Copy raw JSON">
                    <Button
                      variant="plain"
                      icon={copied ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                      onClick={handleCopy}
                      aria-label="Copy raw JSON"
                    />
                  </Tooltip>
                </div>
                <pre
                  style={{
                    backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                    color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                    border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                    borderRadius: '6px',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    whiteSpace: 'pre',
                  }}
                >
                  <code>{rawText}</code>
                </pre>
              </div>
            </Tab>
          </Tabs>
        </div>
        </>
      )}
    </Modal>
  );
};
