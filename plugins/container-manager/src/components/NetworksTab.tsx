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
} from '@patternfly/react-core';
import { TrashIcon, InfoCircleIcon } from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { NetworkItem } from '../types';
import { HashId } from './HashId';

export interface NetworksTabProps {
  networks: NetworkItem[];
  onDelete: (network: NetworkItem) => void;
  onPruneUnused: () => void;
  onOpenInspect: (kind: 'network', id: string, name?: string) => void;
  isLoading?: boolean;
}

export const NetworksTab: React.FC<NetworksTabProps> = ({
  networks,
  onDelete,
  onPruneUnused,
  onOpenInspect,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [activeSortIndex, setActiveSortIndex] = useState<number | null>(null);
  const [activeSortDirection, setActiveSortDirection] = useState<'asc' | 'desc'>('asc');

  const filteredNetworks = networks.filter(
    (n) =>
      n.name.toLowerCase().includes(filterText.toLowerCase()) ||
      n.driver.toLowerCase().includes(filterText.toLowerCase()) ||
      (n.subnet && n.subnet.toLowerCase().includes(filterText.toLowerCase())) ||
      n.shortId.toLowerCase().includes(filterText.toLowerCase()) ||
      n.id.toLowerCase().includes(filterText.toLowerCase())
  );

  const sortedNetworks = [...filteredNetworks].sort((a, b) => {
    if (activeSortIndex === null) {
      return 0;
    }
    let aVal = '';
    let bVal = '';
    switch (activeSortIndex) {
      case 0:
        aVal = a.name;
        bVal = b.name;
        break;
      case 1:
        aVal = a.driver;
        bVal = b.driver;
        break;
      case 2:
        aVal = a.scope;
        bVal = b.scope;
        break;
      case 3:
        aVal = a.subnet || '';
        bVal = b.subnet || '';
        break;
      case 4:
        aVal = a.isBuiltIn ? '1' : '0';
        bVal = b.isBuiltIn ? '1' : '0';
        break;
      default:
        return 0;
    }
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
    return activeSortDirection === 'asc' ? cmp : -cmp;
  });

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

  const unusedCustomCount = networks.filter((n) => !n.isBuiltIn && !n.inUse).length;

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
            placeholder="Filter networks by name, driver, subnet, ID..."
            value={filterText}
            onChange={(_event, val) => setFilterText(val)}
            onClear={() => setFilterText('')}
          />
        </FlexItem>

        <FlexItem>
          <Tooltip content="Remove all unused custom networks">
            <Button
              variant="secondary"
              icon={<TrashIcon />}
              onClick={onPruneUnused}
              isDisabled={isLoading || unusedCustomCount === 0}
            >
              Prune Unused Networks ({unusedCustomCount})
            </Button>
          </Tooltip>
        </FlexItem>
      </Flex>

      {filteredNetworks.length === 0 ? (
        <EmptyState>
          <Title headingLevel="h4" size="lg">
            No Networks Found
          </Title>
          <EmptyStateBody>
            {filterText
              ? `No networks match "${filterText}".`
              : 'There are currently no container networks available.'}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label="Networks Table" variant="compact">
            <Thead>
              <Tr>
                <Th width={25} sort={getSortParams(0)}>Network Name</Th>
                <Th width={15} sort={getSortParams(1)}>Driver</Th>
                <Th width={15} sort={getSortParams(2)}>Scope</Th>
                <Th width={20} sort={getSortParams(3)}>Subnet</Th>
                <Th width={10} sort={getSortParams(4)}>Type</Th>
                <Th width={15} style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedNetworks.map((net) => {
                const canDelete = !net.isBuiltIn && !net.inUse;

                return (
                  <Tr key={net.id || net.name}>
                    <Td dataLabel="Network Name">
                      <strong style={{ fontSize: '0.95rem' }}>{net.name}</strong>
                      {net.id && (
                        <div style={{ marginTop: '2px' }}>
                          <HashId id={net.id} shortId={net.shortId} />
                        </div>
                      )}
                    </Td>
                    <Td dataLabel="Driver">
                      <span style={{ fontSize: '0.85rem' }}>{net.driver}</span>
                    </Td>
                    <Td dataLabel="Scope">
                      <span style={{ fontSize: '0.85rem' }}>{net.scope}</span>
                    </Td>
                    <Td dataLabel="Subnet">
                      <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {net.subnet || '—'}
                      </span>
                    </Td>
                    <Td dataLabel="Type">
                      <StatusBadge variant={net.isBuiltIn ? 'grey' : 'blue'}>
                        {net.isBuiltIn ? 'System' : 'Custom'}
                      </StatusBadge>
                    </Td>
                    <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                      <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        <Tooltip content="Inspect Network Details">
                          <Button
                            variant="plain"
                            icon={<InfoCircleIcon />}
                            onClick={() => onOpenInspect('network', net.id || net.name, net.name)}
                            aria-label="Inspect network"
                          />
                        </Tooltip>
                        <Tooltip
                          content={
                            net.isBuiltIn
                              ? 'Default system networks cannot be deleted'
                              : net.inUse
                              ? 'Network currently has attached containers'
                              : 'Delete network'
                          }
                        >
                          <Button
                            variant="plain"
                            icon={<TrashIcon style={{ color: canDelete ? 'var(--pf-v5-global--danger-color--100, #ff5555)' : '#8b949e' }} />}
                            isDisabled={!canDelete || isLoading}
                            onClick={() => onDelete(net)}
                            aria-label="Delete network"
                          />
                        </Tooltip>
                      </Flex>
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
