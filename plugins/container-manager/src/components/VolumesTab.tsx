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
import { VolumeItem } from '../types';

export interface VolumesTabProps {
  volumes: VolumeItem[];
  onDelete: (volume: VolumeItem) => void;
  onPruneUnused: () => void;
  isLoading?: boolean;
}

export const VolumesTab: React.FC<VolumesTabProps> = ({
  volumes,
  onDelete,
  onPruneUnused,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredVolumes = volumes.filter(
    (v) =>
      v.name.toLowerCase().includes(filterText.toLowerCase()) ||
      v.driver.toLowerCase().includes(filterText.toLowerCase()) ||
      v.mountpoint.toLowerCase().includes(filterText.toLowerCase())
  );

  const unusedCount = volumes.filter((v) => !v.inUse).length;

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
            placeholder="Filter volumes by name, driver, path..."
            value={filterText}
            onChange={(_event, val) => setFilterText(val)}
            onClear={() => setFilterText('')}
          />
        </FlexItem>

        <FlexItem>
          <Tooltip content="Remove all unused volumes">
            <Button
              variant="secondary"
              icon={<TrashIcon />}
              onClick={onPruneUnused}
              isDisabled={isLoading || unusedCount === 0}
            >
              Prune Unused Volumes ({unusedCount})
            </Button>
          </Tooltip>
        </FlexItem>
      </Flex>

      {filteredVolumes.length === 0 ? (
        <EmptyState>
          <Title headingLevel="h4" size="lg">
            No Volumes Found
          </Title>
          <EmptyStateBody>
            {filterText
              ? `No volumes match "${filterText}".`
              : 'There are currently no persistent volumes defined.'}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label="Volumes Table" variant="compact">
            <Thead>
              <Tr>
                <Th width={30}>Volume Name</Th>
                <Th width={15}>Driver</Th>
                <Th width={35}>Mountpoint</Th>
                <Th width={10}>Usage</Th>
                <Th width={10} style={{ textAlign: 'right' }}>Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredVolumes.map((vol) => (
                <Tr key={vol.name}>
                  <Td dataLabel="Volume Name">
                    <strong style={{ fontSize: '0.95rem' }}>{vol.name}</strong>
                  </Td>
                  <Td dataLabel="Driver">
                    <span style={{ fontSize: '0.85rem' }}>{vol.driver}</span>
                  </Td>
                  <Td dataLabel="Mountpoint">
                    <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {vol.mountpoint || '—'}
                    </span>
                  </Td>
                  <Td dataLabel="Usage">
                    <StatusBadge variant={vol.inUse ? 'blue' : 'grey'}>
                      {vol.inUse ? 'In Use' : 'Unused'}
                    </StatusBadge>
                  </Td>
                  <Td dataLabel="Action" style={{ textAlign: 'right' }}>
                    <Tooltip content={vol.inUse ? 'Volume is currently mounted by a container' : 'Delete volume'}>
                      <Button
                        variant="plain"
                        icon={<TrashIcon />}
                        isDisabled={vol.inUse || isLoading}
                        onClick={() => onDelete(vol)}
                        aria-label="Delete volume"
                        style={{ color: vol.inUse ? undefined : 'var(--pf-v5-global--danger-color--100, #ff5555)' }}
                      />
                    </Tooltip>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
};
