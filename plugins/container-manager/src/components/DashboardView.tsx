import React from 'react';
import {
  PageSection,
  Card,
  CardTitle,
  CardBody,
  Grid,
  GridItem,
  Progress,
  ProgressMeasureLocation,
  Button,
  Flex,
  FlexItem,
  Title,
  Tooltip,
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
  BoxIcon,
  LayerGroupIcon,
  HddIcon,
  NetworkIcon,
  StopIcon,
  SyncAltIcon,
  TerminalIcon,
  FileAltIcon,
  InfoCircleIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import {
  ContainerItem,
  ImageItem,
  VolumeItem,
  NetworkItem,
} from '../types';

export interface DashboardViewProps {
  containers: ContainerItem[];
  images: ImageItem[];
  volumes: VolumeItem[];
  networks: NetworkItem[];
  onNavigateTab: (tab: string) => void;
  onAction: (id: string, action: 'start' | 'stop' | 'kill' | 'restart') => void;
  onOpenTerminal: (container: ContainerItem) => void;
  onOpenLogs: (container: ContainerItem) => void;
  onOpenInspect: (kind: 'container' | 'image' | 'volume' | 'network', id: string, name?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  containers,
  images,
  volumes,
  networks,
  onNavigateTab,
  onAction,
  onOpenTerminal,
  onOpenLogs,
  onOpenInspect,
}) => {
  const runningContainers = containers.filter((c) => c.state === 'running');
  const runningPct = containers.length > 0 ? (runningContainers.length / containers.length) * 100 : 0;

  const inUseImages = images.filter((i) => i.inUse).length;
  const inUseVolumes = volumes.filter((v) => v.inUse).length;

  return (
    <>
      {/* Top Header Section */}
      <PageSection style={{ paddingBottom: '0.5rem', backgroundColor: 'transparent' }}>
        <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0 }}>
          Containers
        </Title>
      </PageSection>

      {/* Metric Cards Grid */}
      <PageSection style={{ paddingTop: '1.5rem' }}>
        <Grid hasGutter>
          {/* Containers Card */}
          <GridItem span={12} sm={6} md={3}>
            <Card isClickable onClick={() => onNavigateTab('containers')} style={{ height: '100%' }}>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <BoxIcon style={{ color: 'var(--pf-v5-global--primary-color--100, #0066cc)', marginRight: '8px' }} />
                    Containers
                  </FlexItem>
                  <FlexItem>
                    <StatusBadge variant={runningContainers.length > 0 ? 'green' : 'grey'}>
                      {runningContainers.length} Running
                    </StatusBadge>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {runningContainers.length}{' '}
                  <span style={{ fontSize: '1rem', fontWeight: 400, color: '#8b949e' }}>
                    / {containers.length} total
                  </span>
                </div>
                <Progress
                  value={runningPct}
                  measureLocation={ProgressMeasureLocation.none}
                  size="sm"
                  variant={runningPct > 0 ? undefined : undefined}
                />
              </CardBody>
            </Card>
          </GridItem>

          {/* Images Card */}
          <GridItem span={12} sm={6} md={3}>
            <Card isClickable onClick={() => onNavigateTab('images')} style={{ height: '100%' }}>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <LayerGroupIcon style={{ color: 'var(--pf-v5-global--info-color--100, #2b9af3)', marginRight: '8px' }} />
                    Images
                  </FlexItem>
                  <FlexItem>
                    <StatusBadge variant="blue">{images.length} Total</StatusBadge>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {images.length}{' '}
                  <span style={{ fontSize: '1rem', fontWeight: 400, color: '#8b949e' }}>
                    ({inUseImages} in use)
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                  {images.length - inUseImages} unused / dangling images
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Volumes Card */}
          <GridItem span={12} sm={6} md={3}>
            <Card isClickable onClick={() => onNavigateTab('volumes')} style={{ height: '100%' }}>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <HddIcon style={{ color: 'var(--pf-v5-global--warning-color--100, #f0ab00)', marginRight: '8px' }} />
                    Volumes
                  </FlexItem>
                  <FlexItem>
                    <StatusBadge variant="orange">{volumes.length} Total</StatusBadge>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {volumes.length}{' '}
                  <span style={{ fontSize: '1rem', fontWeight: 400, color: '#8b949e' }}>
                    ({inUseVolumes} in use)
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                  {volumes.length - inUseVolumes} unused storage volumes
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Networks Card */}
          <GridItem span={12} sm={6} md={3}>
            <Card isClickable onClick={() => onNavigateTab('networks')} style={{ height: '100%' }}>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <NetworkIcon style={{ color: 'var(--pf-v5-global--success-color--100, #3e8635)', marginRight: '8px' }} />
                    Networks
                  </FlexItem>
                  <FlexItem>
                    <StatusBadge variant="green">{networks.length} Total</StatusBadge>
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {networks.length}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                  Standard bridge, host, and custom networks
                </div>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* Active Containers Section */}
        <div style={{ marginTop: '1.5rem' }}>
          <Card>
            <CardTitle>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Title headingLevel="h3" size="lg">
                    Active Containers
                  </Title>
                </FlexItem>
                <FlexItem>
                  <Button variant="link" onClick={() => onNavigateTab('containers')} isInline>
                    View all containers ({containers.length}) →
                  </Button>
                </FlexItem>
              </Flex>
            </CardTitle>
            <CardBody style={{ padding: 0 }}>
              {runningContainers.length > 0 ? (
                <Table variant="compact" aria-label="Active Containers Table">
                  <Thead>
                    <Tr>
                      <Th>Name</Th>
                      <Th>Image</Th>
                      <Th>Status</Th>
                      <Th>Ports</Th>
                      <Th style={{ textAlign: 'right' }}>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {runningContainers.slice(0, 5).map((c) => (
                      <Tr key={c.id}>
                        <Td dataLabel="Name">
                          <strong>{c.name}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#8b949e' }}>
                            <code>{c.shortId}</code>
                          </div>
                        </Td>
                        <Td dataLabel="Image">
                          <span style={{ fontSize: '0.85rem' }}>{c.image}</span>
                        </Td>
                        <Td dataLabel="Status">
                          <StatusBadge variant="green">{c.status}</StatusBadge>
                        </Td>
                        <Td dataLabel="Ports">
                          <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                            {c.ports || '--'}
                          </span>
                        </Td>
                        <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                          <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} spaceItems={{ default: 'spaceItemsXs' }}>
                            <Tooltip content="Stop Container">
                              <Button
                                variant="plain"
                                icon={<StopIcon />}
                                onClick={() => onAction(c.id, 'stop')}
                                aria-label="Stop"
                              />
                            </Tooltip>
                            <Tooltip content="Restart Container">
                              <Button
                                variant="plain"
                                icon={<SyncAltIcon />}
                                onClick={() => onAction(c.id, 'restart')}
                                aria-label="Restart"
                              />
                            </Tooltip>
                            <Tooltip content="Open Terminal">
                              <Button
                                variant="plain"
                                icon={<TerminalIcon />}
                                onClick={() => onOpenTerminal(c)}
                                aria-label="Terminal"
                              />
                            </Tooltip>
                            <Tooltip content="View Logs">
                              <Button
                                variant="plain"
                                icon={<FileAltIcon />}
                                onClick={() => onOpenLogs(c)}
                                aria-label="Logs"
                              />
                            </Tooltip>
                            <Tooltip content="Inspect Details">
                              <Button
                                variant="plain"
                                icon={<InfoCircleIcon />}
                                onClick={() => onOpenInspect('container', c.id, c.name)}
                                aria-label="Inspect"
                              />
                            </Tooltip>
                          </Flex>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
                  No containers currently running.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </PageSection>
    </>
  );
};
