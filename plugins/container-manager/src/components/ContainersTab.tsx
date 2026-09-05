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
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  MenuToggleElement,
  Tooltip,
} from '@patternfly/react-core';
import {
  PlayIcon,
  StopIcon,
  SyncAltIcon,
  TimesCircleIcon,
  TerminalIcon,
  FileAltIcon,
  TrashIcon,
  EllipsisVIcon,
} from '@patternfly/react-icons';
import { StatusBadge, BadgeVariant } from '@cockpit-plugins/common';
import { ContainerItem } from '../types';

export interface ContainersTabProps {
  containers: ContainerItem[];
  onAction: (id: string, action: 'start' | 'stop' | 'kill' | 'restart') => void;
  onDelete: (container: ContainerItem) => void;
  onOpenTerminal: (container: ContainerItem) => void;
  onOpenLogs: (container: ContainerItem) => void;
  onPruneStopped: () => void;
  isLoading?: boolean;
}

export const ContainersTab: React.FC<ContainersTabProps> = ({
  containers,
  onAction,
  onDelete,
  onOpenTerminal,
  onOpenLogs,
  onPruneStopped,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const filteredContainers = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(filterText.toLowerCase()) ||
      c.image.toLowerCase().includes(filterText.toLowerCase()) ||
      c.shortId.toLowerCase().includes(filterText.toLowerCase())
  );

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

  return (
    <div style={{ padding: '1.5rem' }}>
      <Flex
        justifyContent={{ default: 'justifyContentSpaceBetween' }}
        alignItems={{ default: 'alignItemsCenter' }}
        style={{ marginBottom: '1.25rem' }}
        flexWrap={{ default: 'wrap' }}
      >
        <FlexItem grow={{ default: 'grow' }} style={{ maxWidth: '400px' }}>
          <SearchInput
            placeholder="Filter containers by name, image, ID..."
            value={filterText}
            onChange={(_event, val) => setFilterText(val)}
            onClear={() => setFilterText('')}
          />
        </FlexItem>

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
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label="Containers Table" variant="compact">
            <Thead>
              <Tr>
                <Th width={15}>State</Th>
                <Th width={20}>Name</Th>
                <Th width={20}>Image</Th>
                <Th width={20}>Ports</Th>
                <Th width={15}>Created</Th>
                <Th width={10} style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredContainers.map((c) => {
                const isRunning = c.state === 'running';
                const isOpen = openDropdownId === c.id;

                return (
                  <Tr key={c.id}>
                    <Td dataLabel="State">
                      <StatusBadge variant={getBadgeVariant(c.state)}>
                        {c.status || c.state}
                      </StatusBadge>
                    </Td>
                    <Td dataLabel="Name">
                      <strong style={{ fontSize: '0.95rem' }}>{c.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: 'var(--pf-v5-global--Color--200, #8b949e)', fontFamily: 'monospace' }}>
                        {c.shortId}
                      </div>
                    </Td>
                    <Td dataLabel="Image">
                      <code style={{ fontSize: '0.85rem' }}>{c.image}</code>
                    </Td>
                    <Td dataLabel="Ports">
                      {c.ports ? (
                        <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{c.ports}</span>
                      ) : (
                        <span style={{ color: 'var(--pf-v5-global--Color--200, #8b949e)', fontSize: '0.85rem' }}>—</span>
                      )}
                    </Td>
                    <Td dataLabel="Created">
                      <span style={{ fontSize: '0.85rem' }}>{c.created}</span>
                    </Td>
                    <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                      <Dropdown
                        popperProps={{ appendTo: () => document.body, position: 'right' }}
                        isOpen={isOpen}
                        onOpenChange={(open) => setOpenDropdownId(open ? c.id : null)}
                        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                          <MenuToggle
                            ref={toggleRef}
                            variant="plain"
                            onClick={() => setOpenDropdownId(isOpen ? null : c.id)}
                            isExpanded={isOpen}
                            aria-label="Actions"
                          >
                            <EllipsisVIcon />
                          </MenuToggle>
                        )}
                      >
                        <DropdownList>
                          {isRunning ? (
                            <>
                              <DropdownItem
                                key="stop"
                                icon={<StopIcon />}
                                onClick={() => {
                                  onAction(c.id, 'stop');
                                  setOpenDropdownId(null);
                                }}
                              >
                                Stop
                              </DropdownItem>
                              <DropdownItem
                                key="restart"
                                icon={<SyncAltIcon />}
                                onClick={() => {
                                  onAction(c.id, 'restart');
                                  setOpenDropdownId(null);
                                }}
                              >
                                Restart
                              </DropdownItem>
                              <DropdownItem
                                key="kill"
                                icon={<TimesCircleIcon />}
                                onClick={() => {
                                  onAction(c.id, 'kill');
                                  setOpenDropdownId(null);
                                }}
                              >
                                Kill
                              </DropdownItem>
                              <DropdownItem
                                key="terminal"
                                icon={<TerminalIcon />}
                                onClick={() => {
                                  onOpenTerminal(c);
                                  setOpenDropdownId(null);
                                }}
                              >
                                Terminal
                              </DropdownItem>
                            </>
                          ) : (
                            <DropdownItem
                              key="start"
                              icon={<PlayIcon />}
                              onClick={() => {
                                onAction(c.id, 'start');
                                setOpenDropdownId(null);
                              }}
                            >
                              Start
                            </DropdownItem>
                          )}
                          <DropdownItem
                            key="logs"
                            icon={<FileAltIcon />}
                            onClick={() => {
                              onOpenLogs(c);
                              setOpenDropdownId(null);
                            }}
                          >
                            Logs
                          </DropdownItem>
                          {!isRunning && c.state !== 'paused' && (
                            <DropdownItem
                              key="delete"
                              icon={<TrashIcon />}
                              style={{ color: 'var(--pf-v5-global--danger-color--100, #ff5555)' }}
                              onClick={() => {
                                onDelete(c);
                                setOpenDropdownId(null);
                              }}
                            >
                              Delete
                            </DropdownItem>
                          )}
                        </DropdownList>
                      </Dropdown>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
};
