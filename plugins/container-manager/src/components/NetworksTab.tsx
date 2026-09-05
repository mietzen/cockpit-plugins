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
import { TrashIcon } from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { NetworkItem } from '../types';

export interface NetworksTabProps {
  networks: NetworkItem[];
  onDelete: (network: NetworkItem) => void;
  onPruneUnused: () => void;
  isLoading?: boolean;
}

export const NetworksTab: React.FC<NetworksTabProps> = ({
  networks,
  onDelete,
  onPruneUnused,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredNetworks = networks.filter(
    (n) =>
      n.name.toLowerCase().includes(filterText.toLowerCase()) ||
      n.driver.toLowerCase().includes(filterText.toLowerCase()) ||
      (n.subnet && n.subnet.toLowerCase().includes(filterText.toLowerCase()))
  );

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
            placeholder="Filter networks by name, driver, subnet..."
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
                <Th width={25}>Network Name</Th>
                <Th width={15}>Driver</Th>
                <Th width={15}>Scope</Th>
                <Th width={25}>Subnet</Th>
                <Th width={10}>Type</Th>
                <Th width={10} style={{ textAlign: 'right' }}>Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredNetworks.map((net) => {
                const canDelete = !net.isBuiltIn && !net.inUse;

                return (
                  <Tr key={net.id || net.name}>
                    <Td dataLabel="Network Name">
                      <strong style={{ fontSize: '0.95rem' }}>{net.name}</strong>
                      {net.shortId && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--pf-v5-global--Color--200, #8b949e)', fontFamily: 'monospace' }}>
                          {net.shortId}
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
                    <Td dataLabel="Action" style={{ textAlign: 'right' }}>
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
                          icon={<TrashIcon />}
                          isDisabled={!canDelete || isLoading}
                          onClick={() => onDelete(net)}
                          aria-label="Delete network"
                          style={{ color: canDelete ? 'var(--pf-v5-global--danger-color--100, #ff5555)' : undefined }}
                        />
                      </Tooltip>
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
