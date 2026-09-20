import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Flex,
  FlexItem,
  Card,
  CardTitle,
  CardBody,
  Title,
  TextInput,
  Tooltip,
  Alert,
  Grid,
  GridItem,
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
  ServerIcon,
  HddIcon,
  CodeIcon,
  TagIcon,
  CubesIcon,
  GlobeIcon,
} from '@patternfly/react-icons';
import { StatusBadge, BadgeVariant } from '@cockpit-plugins/common';
import { containerApi } from '../api/containerClient';
import { EngineType } from '../types';
import { HashId } from './HashId';
import { PortLinks } from './PortLinks';

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
  const [envFilter, setEnvFilter] = useState<string>('');
  const [copiedRaw, setCopiedRaw] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && id) {
      setLoading(true);
      setError(null);
      setData(null);
      setRawText('');
      setEnvFilter('');

      containerApi
        .inspectEntity(kind, id, activeEngine)
        .then((res) => {
          if (res.status === 'error') {
            setError(res.error || 'Failed to inspect entity');
          } else {
            setData(res.data || {});
            setRawText(
              res.raw
                ? typeof res.raw === 'string'
                  ? res.raw
                  : JSON.stringify(res.raw, null, 2)
                : JSON.stringify(res.data || {}, null, 2)
            );
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

  const handleCopyRaw = () => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  if (!isOpen) return null;

  const titleName = name || id;

  // Extract common properties
  const config = data?.Config || data?.config || {};
  const stateObj = data?.State || data?.state || {};
  const stateStr =
    (typeof stateObj === 'string'
      ? stateObj
      : stateObj?.Status || stateObj?.status || ''
    ).toLowerCase() || 'unknown';

  const getBadgeVariant = (st: string): BadgeVariant => {
    switch (st) {
      case 'running':
        return 'green';
      case 'paused':
        return 'orange';
      case 'exited':
      case 'created':
        return 'grey';
      case 'dead':
      default:
        return 'red';
    }
  };

  const networkSettings = data?.NetworkSettings || data?.networkSettings || {};
  const networksObj = networkSettings?.Networks || networkSettings?.networks || {};
  const ipAddress =
    networkSettings?.IPAddress ||
    networkSettings?.ipAddress ||
    (Object.values(networksObj)[0] as any)?.IPAddress ||
    '--';

  const portsObj = networkSettings?.Ports || networkSettings?.ports || {};
  const portRows: { containerPort: string; hostMapping: string; rawMapping: string }[] = [];
  if (portsObj && typeof portsObj === 'object') {
    Object.entries(portsObj).forEach(([cPort, mappings]) => {
      if (Array.isArray(mappings) && mappings.length > 0) {
        mappings.forEach((m: any) => {
          const hIp = m.HostIp || '0.0.0.0';
          const hPort = m.HostPort || '';
          portRows.push({
            containerPort: cPort,
            hostMapping: `${hIp}:${hPort}`,
            rawMapping: `${hIp}:${hPort}->${cPort}`,
          });
        });
      } else {
        portRows.push({ containerPort: cPort, hostMapping: 'none', rawMapping: cPort });
      }
    });
  }

  // Mounts & Volumes
  const mounts = data?.Mounts || data?.mounts || [];

  // Environment variables
  const envList: string[] = config?.Env || config?.env || [];
  const filteredEnv = envList.filter((e) =>
    e.toLowerCase().includes(envFilter.toLowerCase())
  );

  // Labels
  const labels = config?.Labels || config?.labels || data?.Labels || data?.labels || {};
  const labelEntries = Object.entries(labels);

  // Command & Entrypoint
  const cmdList = config?.Cmd || config?.cmd || [];
  const cmdStr = Array.isArray(cmdList) ? cmdList.join(' ') : String(cmdList || '');
  const entrypointList = config?.Entrypoint || config?.entrypoint || [];
  const entrypointStr = Array.isArray(entrypointList)
    ? entrypointList.join(' ')
    : String(entrypointList || '');
  const workDir = config?.WorkingDir || config?.workingDir || '/';

  // Restart Policy
  const hostConfig = data?.HostConfig || data?.hostConfig || {};
  const restartPolicyObj =
    hostConfig?.RestartPolicy || hostConfig?.restartPolicy || data?.RestartPolicy || {};
  const restartPolicyName =
    restartPolicyObj?.Name ||
    restartPolicyObj?.name ||
    (typeof restartPolicyObj === 'string' ? restartPolicyObj : '') ||
    'no';
  const restartPolicyRetries =
    restartPolicyObj?.MaximumRetryCount || restartPolicyObj?.maximumRetryCount;
  const restartPolicyStr = restartPolicyRetries
    ? `${restartPolicyName} (max retries: ${restartPolicyRetries})`
    : restartPolicyName;
  const entityId = data?.Id || data?.id || data?.ID || id || '';
  const cleanEntityId = entityId.startsWith('sha256:') ? entityId.slice(7) : entityId;
  const imageId = data?.ImageID || data?.ImageId || data?.Image || '';
  const cleanImageId = typeof imageId === 'string' && imageId.startsWith('sha256:') ? imageId.slice(7) : String(imageId);

  return (
    <Modal
      variant={ModalVariant.large}
      width="90%"
      style={{
        maxWidth: '90vw',
        height: '90vh',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}
      title={`Inspect: ${titleName}`}
      isOpen={isOpen}
      onClose={onClose}
      appendTo={() => document.body}
      actions={[
        <Button key="copy-raw" variant="secondary" icon={<CopyIcon />} onClick={handleCopyRaw}>
          {copiedRaw ? 'Copied Raw JSON' : 'Copy Raw JSON'}
        </Button>,
        <Button key="close" variant="primary" onClick={onClose}>
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
        <div style={{ padding: '3rem', textAlign: 'center', color: '#8b949e' }}>
          Loading inspection data...
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            paddingRight: '4px',
            paddingBottom: '1.25rem',
          }}
        >
          {/* Header Summary Card */}
          <Card>
            <CardBody>
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
                flexWrap={{ default: 'wrap' }}
                style={{ gap: '1rem' }}
              >
                <FlexItem>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <Title headingLevel="h3" size="lg" style={{ margin: 0, fontWeight: 700 }}>
                      {titleName}
                    </Title>
                    {kind === 'container' && stateStr && stateStr !== 'unknown' && (
                      <StatusBadge variant={getBadgeVariant(stateStr)}>
                        {stateStr.toUpperCase()}
                      </StatusBadge>
                    )}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#8b949e', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>ID:</span>
                    <HashId id={cleanEntityId} />
                  </div>
                </FlexItem>

                {cleanImageId && (
                  <FlexItem>
                    <div style={{ fontSize: '0.82rem', color: '#8b949e' }}>Image</div>
                    <div style={{ marginTop: '2px' }}>
                      {cleanImageId.length === 64 || cleanImageId.length === 12 ? (
                        <HashId id={cleanImageId} />
                      ) : (
                        <strong style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
                          {cleanImageId}
                        </strong>
                      )}
                    </div>
                  </FlexItem>
                )}

                <FlexItem>
                  <div style={{ fontSize: '0.82rem', color: '#8b949e' }}>Engine</div>
                  <strong style={{ fontSize: '0.9rem', textTransform: 'capitalize' }}>
                    {activeEngine}
                  </strong>
                </FlexItem>

                <FlexItem>
                  <div style={{ fontSize: '0.82rem', color: '#8b949e' }}>Created</div>
                  <div style={{ fontSize: '0.9rem' }}>
                    {data?.Created || data?.created || '--'}
                  </div>
                </FlexItem>
              </Flex>
            </CardBody>
          </Card>

          {/* Runtime & Execution */}
          <Card>
            <CardTitle>
              <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <CubesIcon style={{ color: 'var(--pf-v5-global--primary-color--100, #2b9af3)' }} />
                <span>Runtime &amp; Execution</span>
              </Flex>
            </CardTitle>
            <CardBody style={{ padding: 0 }}>
              <Table variant="compact" aria-label="Runtime Properties">
                <Tbody>
                  <Tr>
                    <Td style={{ width: '220px', fontWeight: 600 }}>Full ID / SHA</Td>
                    <Td>
                      <HashId id={cleanEntityId} shortId={cleanEntityId} />
                    </Td>
                  </Tr>
                  {cleanImageId && kind === 'container' && (
                    <Tr>
                      <Td style={{ fontWeight: 600 }}>Image ID</Td>
                      <Td>
                        <HashId id={cleanImageId} shortId={cleanImageId} />
                      </Td>
                    </Tr>
                  )}
                  {kind === 'container' && (
                    <>
                      <Tr>
                        <Td style={{ width: '220px', fontWeight: 600 }}>Restart Policy</Td>
                        <Td>
                          <code>{restartPolicyStr}</code>
                        </Td>
                      </Tr>
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>IP Address</Td>
                        <Td>
                          <code>{ipAddress}</code>
                        </Td>
                      </Tr>
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Working Directory</Td>
                        <Td>
                          <code>{workDir}</code>
                        </Td>
                      </Tr>
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Entrypoint</Td>
                        <Td>
                          <code style={{ wordBreak: 'break-all' }}>{entrypointStr || 'none'}</code>
                        </Td>
                      </Tr>
                      <Tr>
                        <Td style={{ fontWeight: 600 }}>Command</Td>
                        <Td>
                          <code style={{ wordBreak: 'break-all' }}>{cmdStr || 'none'}</code>
                        </Td>
                      </Tr>
                    </>
                  )}
                  {data?.Size && (
                    <Tr>
                      <Td style={{ width: '220px', fontWeight: 600 }}>Size</Td>
                      <Td>
                        {typeof data.Size === 'number'
                          ? `${(data.Size / (1024 * 1024)).toFixed(1)} MB`
                          : String(data.Size)}
                      </Td>
                    </Tr>
                  )}
                  {data?.Driver && (
                    <Tr>
                      <Td style={{ width: '220px', fontWeight: 600 }}>Driver</Td>
                      <Td>{String(data.Driver)}</Td>
                    </Tr>
                  )}
                  {data?.Mountpoint && (
                    <Tr>
                      <Td style={{ width: '220px', fontWeight: 600 }}>Mountpoint</Td>
                      <Td>
                        <code>{String(data.Mountpoint)}</code>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>

          {/* Networking & Ports */}
          {kind === 'container' && (
            <Card>
              <CardTitle>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <GlobeIcon style={{ color: 'var(--pf-v5-global--info-color--100, #2b9af3)' }} />
                  <span>Networking &amp; Published Ports</span>
                </Flex>
              </CardTitle>
              <CardBody>
                <Grid hasGutter>
                  <GridItem span={12} md={6}>
                    <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                      Published Port Mappings
                    </Title>
                    {portRows.length > 0 ? (
                      <Table variant="compact" aria-label="Ports Table">
                        <Thead>
                          <Tr>
                            <Th>Container Port</Th>
                            <Th>Host Binding &amp; Link</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {portRows.map((p, idx) => (
                            <Tr key={idx}>
                              <Td>
                                <code>{p.containerPort}</code>
                              </Td>
                              <Td>
                                {p.hostMapping !== 'none' ? (
                                  <PortLinks ports={p.rawMapping} />
                                ) : (
                                  <span style={{ color: '#8b949e' }}>Unmapped</span>
                                )}
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    ) : (
                      <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>
                        No published ports.
                      </p>
                    )}
                  </GridItem>

                  <GridItem span={12} md={6}>
                    <Title headingLevel="h4" size="md" style={{ marginBottom: '0.75rem' }}>
                      Connected Networks
                    </Title>
                    {Object.keys(networksObj).length > 0 ? (
                      <Table variant="compact" aria-label="Networks Table">
                        <Thead>
                          <Tr>
                            <Th>Network</Th>
                            <Th>IP</Th>
                            <Th>Gateway</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {Object.entries(networksObj).map(([nName, nVal]: [string, any]) => (
                            <Tr key={nName}>
                              <Td>
                                <strong>{nName}</strong>
                              </Td>
                              <Td>
                                <code>{nVal?.IPAddress || '--'}</code>
                              </Td>
                              <Td>
                                <code>{nVal?.Gateway || '--'}</code>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    ) : (
                      <p style={{ color: '#8b949e', fontSize: '0.9rem' }}>
                        No connected networks.
                      </p>
                    )}
                  </GridItem>
                </Grid>
              </CardBody>
            </Card>
          )}

          {/* Mounts & Storage */}
          {kind === 'container' && (
            <Card>
              <CardTitle>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <HddIcon style={{ color: 'var(--pf-v5-global--warning-color--100, #f0ab00)' }} />
                  <span>Mounts &amp; Storage ({mounts.length})</span>
                </Flex>
              </CardTitle>
              <CardBody style={{ padding: mounts.length > 0 ? 0 : '1.25rem' }}>
                {mounts.length > 0 ? (
                  <Table variant="compact" aria-label="Mounts Table">
                    <Thead>
                      <Tr>
                        <Th width={15}>Type</Th>
                        <Th width={35}>Source / Volume</Th>
                        <Th width={35}>Destination</Th>
                        <Th width={15}>Mode</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {mounts.map((m: any, idx: number) => (
                        <Tr key={idx}>
                          <Td>
                            <StatusBadge variant="blue">{m.Type || m.type || 'mount'}</StatusBadge>
                          </Td>
                          <Td>
                            <code>{m.Name || m.Source || m.source || '--'}</code>
                          </Td>
                          <Td>
                            <code>{m.Destination || m.destination || '--'}</code>
                          </Td>
                          <Td>{m.RW || m.rw ? 'Read/Write' : 'Read-Only'}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                ) : (
                  <p style={{ color: '#8b949e', fontSize: '0.9rem', margin: 0 }}>
                    No storage volumes or bind mounts attached.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {/* Environment Variables */}
          {envList.length > 0 && (
            <Card>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <CodeIcon style={{ color: 'var(--pf-v5-global--success-color--100, #3e8635)' }} />
                    <span>Environment Variables ({envList.length})</span>
                  </Flex>
                  <div style={{ width: '260px' }}>
                    <TextInput
                      placeholder="Filter environment..."
                      value={envFilter}
                      onChange={(_e, val) => setEnvFilter(val)}
                      aria-label="Filter environment"
                    />
                  </div>
                </Flex>
              </CardTitle>
              <CardBody>
                <div
                  style={{
                    maxHeight: '220px',
                    overflowY: 'auto',
                    backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                    border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
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
              </CardBody>
            </Card>
          )}

          {/* Labels */}
          {labelEntries.length > 0 && (
            <Card>
              <CardTitle>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <TagIcon style={{ color: 'var(--pf-v5-global--info-color--100, #2b9af3)' }} />
                  <span>Labels ({labelEntries.length})</span>
                </Flex>
              </CardTitle>
              <CardBody style={{ padding: 0 }}>
                <Table variant="compact" aria-label="Labels Table">
                  <Thead>
                    <Tr>
                      <Th width={30}>Key</Th>
                      <Th width={70}>Value</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {labelEntries.map(([k, v]) => (
                      <Tr key={k}>
                        <Td>
                          <code>{k}</code>
                        </Td>
                        <Td style={{ wordBreak: 'break-all' }}>{String(v)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          )}

          {/* Raw JSON Specification */}
          <Card>
            <CardTitle>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <ServerIcon style={{ color: 'var(--pf-v5-global--Color--200, #8b949e)' }} />
                  <span>Raw JSON Specification</span>
                </Flex>
                <Tooltip content="Copy raw JSON">
                  <Button
                    variant="plain"
                    icon={copiedRaw ? <CheckIcon style={{ color: '#3fb950' }} /> : <CopyIcon />}
                    onClick={handleCopyRaw}
                    aria-label="Copy raw JSON"
                  />
                </Tooltip>
              </Flex>
            </CardTitle>
            <CardBody>
              <pre
                style={{
                  backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                  color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
                  border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
                  borderRadius: '6px',
                  padding: '1rem',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  maxHeight: '400px',
                  overflowX: 'auto',
                  overflowY: 'auto',
                  whiteSpace: 'pre',
                  margin: 0,
                }}
              >
                <code>{rawText}</code>
              </pre>
            </CardBody>
          </Card>
        </div>
      )}
    </Modal>
  );
};
