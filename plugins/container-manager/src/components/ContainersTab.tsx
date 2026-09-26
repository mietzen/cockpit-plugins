import React, { useState } from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';
import {
  Button,
  SearchInput,
  Flex,
  FlexItem,
  EmptyState,
  EmptyStateBody,
  Title,
  Tooltip,
  ToggleGroup,
  ToggleGroupItem,
  Card,
  CardBody,
  Label,
} from '@patternfly/react-core';
import {
  PlayIcon,
  StopIcon,
  SyncAltIcon,
  TerminalIcon,
  FileAltIcon,
  TrashIcon,
  InfoCircleIcon,
  BanIcon,
  ListIcon,
  FolderIcon,
  AngleDownIcon,
  AngleRightIcon,
} from '@patternfly/react-icons';
import { StatusBadge, BadgeVariant } from '@cockpit-plugins/common';
import { ContainerItem } from '../types';
import { HashId } from './HashId';
import { PortLinks } from './PortLinks';

export interface ContainersTabProps {
  containers: ContainerItem[];
  onAction: (id: string, action: 'start' | 'stop' | 'kill' | 'restart') => void;
  onDelete: (container: ContainerItem) => void;
  onOpenTerminal: (container: ContainerItem) => void;
  onOpenLogs: (container: ContainerItem) => void;
  onOpenInspect: (kind: 'container', id: string, name?: string) => void;
  onPruneStopped: () => void;
  isLoading?: boolean;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({
  containers,
  onAction,
  onDelete,
  onOpenTerminal,
  onOpenLogs,
  onOpenInspect,
  onPruneStopped,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'stack'>('list');
  const [activeSortIndex, setActiveSortIndex] = useState<number | null>(null);
  const [activeSortDirection, setActiveSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedStacks, setCollapsedStacks] = useState<Record<string, boolean>>({});

  const filteredContainers = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(filterText.toLowerCase()) ||
      c.image.toLowerCase().includes(filterText.toLowerCase()) ||
      c.shortId.toLowerCase().includes(filterText.toLowerCase()) ||
      c.id.toLowerCase().includes(filterText.toLowerCase()) ||
      (c.project && c.project.toLowerCase().includes(filterText.toLowerCase())) ||
      (c.service && c.service.toLowerCase().includes(filterText.toLowerCase()))
  );

  const sortContainers = (list: ContainerItem[]) => {
    if (activeSortIndex === null) {
      return list;
    }
    return [...list].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      switch (activeSortIndex) {
        case 0:
          aVal = a.state;
          bVal = b.state;
          break;
        case 1:
          aVal = a.name;
          bVal = b.name;
          break;
        case 2:
          aVal = a.image;
          bVal = b.image;
          break;
        case 3:
          aVal = a.ports;
          bVal = b.ports;
          break;
        case 4:
          aVal = a.created;
          bVal = b.created;
          break;
        default:
          return 0;
      }
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      return activeSortDirection === 'asc' ? cmp : -cmp;
    });
  };

  const sortedContainers = sortContainers(filteredContainers);
  const stoppedCount = containers.filter((c) => c.state !== 'running').length;

  const getBadgeVariant = (state: string): BadgeVariant => {
    switch (state) {
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

  const getSortParams = (columnIndex: number) => ({
    sortBy: {
      index: activeSortIndex ?? undefined,
      direction: activeSortDirection,
    },
    onSort: (_event: any, index: number, direction: 'asc' | 'desc') => {
      setActiveSortIndex(index);
      setActiveSortDirection(direction);
    },
    columnIndex,
  });

  const toggleStackCollapse = (stackName: string) => {
    setCollapsedStacks((prev) => ({
      ...prev,
      [stackName]: !prev[stackName],
    }));
  };

  // Group into stacks
  const stackMap = sortedContainers.reduce<Record<string, ContainerItem[]>>((acc, container) => {
    const stackKey = container.project ? container.project : 'Standalone Containers';
    if (!acc[stackKey]) {
      acc[stackKey] = [];
    }
    acc[stackKey].push(container);
    return acc;
  }, {});

  const renderContainerRow = (c: ContainerItem) => {
    const isRunning = c.state === 'running';
    const canDelete = !isRunning && c.state !== 'paused';

    return (
      <Tr key={c.id}>
        <Td dataLabel="State">
          <StatusBadge variant={getBadgeVariant(c.state)}>
            {c.status || c.state}
          </StatusBadge>
        </Td>
        <Td dataLabel="Name">
          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
            <strong style={{ fontSize: '0.95rem' }}>{c.name}</strong>
            {c.service && (
              <Label color="blue" isCompact>
                service: {c.service}
              </Label>
            )}
          </Flex>
          <div style={{ marginTop: '2px' }}>
            <HashId id={c.id} shortId={c.shortId} />
          </div>
        </Td>
        <Td dataLabel="Image">
          <code style={{ fontSize: '0.85rem' }}>{c.image}</code>
        </Td>
        <Td dataLabel="Ports">
          <PortLinks ports={c.ports} />
        </Td>
        <Td dataLabel="Created">
          <span style={{ fontSize: '0.85rem' }}>{c.created}</span>
        </Td>
        <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
          <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} spaceItems={{ default: 'spaceItemsXs' }}>
            {isRunning ? (
              <>
                <Tooltip content="Stop Container">
                  <Button
                    variant="plain"
                    icon={<StopIcon />}
                    onClick={() => onAction(c.id, 'stop')}
                    aria-label="Stop"
                  />
                </Tooltip>
                <Tooltip content="Force Kill Container">
                  <Button
                    variant="plain"
                    icon={<BanIcon style={{ color: 'var(--pf-v5-global--warning-color--100, #f0ab00)' }} />}
                    onClick={() => onAction(c.id, 'kill')}
                    aria-label="Kill"
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
              </>
            ) : (
              <Tooltip content="Start Container">
                <Button
                  variant="plain"
                  icon={<PlayIcon />}
                  onClick={() => onAction(c.id, 'start')}
                  aria-label="Start"
                />
              </Tooltip>
            )}

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

            <Tooltip content={canDelete ? 'Delete Container' : 'Cannot delete running container'}>
              <Button
                variant="plain"
                icon={<TrashIcon style={{ color: canDelete ? 'var(--pf-v5-global--danger-color--100, #ff5555)' : '#8b949e' }} />}
                onClick={() => onDelete(c)}
                isDisabled={!canDelete}
                aria-label="Delete"
              />
            </Tooltip>
          </Flex>
        </Td>
      </Tr>
    );
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '1.25rem' }}
        flexWrap={{ default: 'wrap' }}
        gap={{ default: 'gapMd' }}
      >
        <Flex alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'wrap' }} gap={{ default: 'gapMd' }}>
          <FlexItem style={{ minWidth: '280px', maxWidth: '400px' }}>
            <SearchInput
              placeholder="Filter containers by name, image, ID, stack..."
              value={filterText}
              onChange={(_event, val) => setFilterText(val)}
              onClear={() => setFilterText('')}
            />
          </FlexItem>

          <FlexItem>
            <ToggleGroup aria-label="Container View Mode Switcher">
              <ToggleGroupItem
                icon={<ListIcon />}
                text="List View"
                isSelected={viewMode === 'list'}
                onChange={() => setViewMode('list')}
              />
              <ToggleGroupItem
                icon={<FolderIcon />}
                text="Stack View"
                isSelected={viewMode === 'stack'}
                onChange={() => setViewMode('stack')}
              />
            </ToggleGroup>
          </FlexItem>
        </Flex>

        <FlexItem>
          <Tooltip content="Remove all non-running containers">
            <Button
              variant="secondary"
              icon={<TrashIcon />}
              onClick={onPruneStopped}
              isDisabled={isLoading || stoppedCount === 0}
            >
              Prune Stopped ({stoppedCount})
            </Button>
          </Tooltip>
        </FlexItem>
      </Flex>

      {filteredContainers.length === 0 ? (
        <EmptyState>
          <Title headingLevel="h4" size="lg">
            No Containers Found
          </Title>
          <EmptyStateBody>
            {filterText
              ? `No containers match "${filterText}".`
              : 'There are currently no containers managed by this engine.'}
          </EmptyStateBody>
        </EmptyState>
      ) : viewMode === 'list' ? (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label="Containers Table" variant="compact">
            <Thead>
              <Tr>
                <Th width={15} sort={getSortParams(0)}>State</Th>
                <Th width={20} sort={getSortParams(1)}>Name</Th>
                <Th width={20} sort={getSortParams(2)}>Image</Th>
                <Th width={15} sort={getSortParams(3)}>Ports</Th>
                <Th width={10} sort={getSortParams(4)}>Created</Th>
                <Th width={20} style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedContainers.map(renderContainerRow)}
            </Tbody>
          </Table>
        </div>
      ) : (
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          {Object.entries(stackMap).map(([stackName, stackContainers]) => {
            const isCollapsed = Boolean(collapsedStacks[stackName]);
            const runningInStack = stackContainers.filter((c) => c.state === 'running').length;

            return (
              <Card key={stackName} isCompact style={{ border: '1px solid var(--zfs-card-border, #30363d)' }}>
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: isCollapsed ? 'none' : '1px solid var(--zfs-card-border, #30363d)',
                    backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
                  }}
                  onClick={() => toggleStackCollapse(stackName)}
                >
                  <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                    {isCollapsed ? <AngleRightIcon /> : <AngleDownIcon />}
                    <FolderIcon style={{ color: 'var(--pf-v5-global--active-color--100, #58a6ff)' }} />
                    <strong style={{ fontSize: '1rem' }}>{stackName}</strong>
                    <Label color={stackName === 'Standalone Containers' ? 'grey' : 'blue'} isCompact>
                      {stackContainers.length} {stackContainers.length === 1 ? 'container' : 'containers'}
                    </Label>
                  </Flex>

                  <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <StatusBadge variant={runningInStack > 0 ? 'green' : 'grey'}>
                      {runningInStack}/{stackContainers.length} running
                    </StatusBadge>
                  </Flex>
                </div>

                {!isCollapsed && (
                  <CardBody style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                      <Table aria-label={`Stack ${stackName} Table`} variant="compact">
                        <Thead>
                          <Tr>
                            <Th width={15} sort={getSortParams(0)}>State</Th>
                            <Th width={20} sort={getSortParams(1)}>Name</Th>
                            <Th width={20} sort={getSortParams(2)}>Image</Th>
                            <Th width={15} sort={getSortParams(3)}>Ports</Th>
                            <Th width={10} sort={getSortParams(4)}>Created</Th>
                            <Th width={20} style={{ textAlign: 'right' }}>Actions</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {stackContainers.map(renderContainerRow)}
                        </Tbody>
                      </Table>
                    </div>
                  </CardBody>
                )}
              </Card>
            );
          })}
        </Flex>
      )}
    </div>
  );
};
