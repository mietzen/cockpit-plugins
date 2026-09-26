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
import { ImageItem } from '../types';
import { HashId } from './HashId';

export interface ImagesTabProps {
  images: ImageItem[];
  onDelete: (image: ImageItem) => void;
  onPruneUnused: () => void;
  onOpenInspect: (kind: 'image', id: string, name?: string) => void;
  isLoading?: boolean;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({
  images,
  onDelete,
  onPruneUnused,
  onOpenInspect,
  isLoading = false,
}) => {
  const [filterText, setFilterText] = useState('');
  const [activeSortIndex, setActiveSortIndex] = useState<number | null>(null);
  const [activeSortDirection, setActiveSortDirection] = useState<'asc' | 'desc'>('asc');

  const normalizedFilter = filterText.toLowerCase().replace(/^sha256:/, '');
  const filteredImages = images.filter(
    (img) =>
      img.repository.toLowerCase().includes(filterText.toLowerCase()) ||
      img.tag.toLowerCase().includes(filterText.toLowerCase()) ||
      img.shortId.toLowerCase().includes(normalizedFilter) ||
      img.id.toLowerCase().includes(normalizedFilter)
  );

  const sortedImages = [...filteredImages].sort((a, b) => {
    if (activeSortIndex === null) return 0;
    let aVal = '';
    let bVal = '';
    switch (activeSortIndex) {
      case 0:
        aVal = a.repository;
        bVal = b.repository;
        break;
      case 1:
        aVal = a.tag;
        bVal = b.tag;
        break;
      case 2:
        aVal = a.shortId;
        bVal = b.shortId;
        break;
      case 3:
        aVal = a.size;
        bVal = b.size;
        break;
      case 4:
        aVal = a.inUse ? '1' : '0';
        bVal = b.inUse ? '1' : '0';
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

  const unusedCount = images.filter((i) => !i.inUse).length;

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
            placeholder="Filter images by repository, tag, ID..."
            value={filterText}
            onChange={(_event, val) => setFilterText(val)}
            onClear={() => setFilterText('')}
          />
        </FlexItem>

        <FlexItem>
          <Tooltip content="Remove all unused and dangling container images">
            <Button
              variant="secondary"
              icon={<TrashIcon />}
              onClick={onPruneUnused}
              isDisabled={isLoading || unusedCount === 0}
            >
              Prune Unused Images ({unusedCount})
            </Button>
          </Tooltip>
        </FlexItem>
      </Flex>

      {filteredImages.length === 0 ? (
        <EmptyState>
          <Title headingLevel="h4" size="lg">
            No Images Found
          </Title>
          <EmptyStateBody>
            {filterText
              ? `No images match "${filterText}".`
              : 'There are currently no images locally available.'}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label="Images Table" variant="compact">
            <Thead>
              <Tr>
                <Th width={30} sort={getSortParams(0)}>Repository</Th>
                <Th width={15} sort={getSortParams(1)}>Tag</Th>
                <Th width={15} sort={getSortParams(2)}>Image ID</Th>
                <Th width={15} sort={getSortParams(3)}>Size</Th>
                <Th width={10} sort={getSortParams(4)}>Usage</Th>
                <Th width={15} style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sortedImages.map((img) => (
                <Tr key={img.id}>
                  <Td dataLabel="Repository">
                    <strong style={{ fontSize: '0.95rem' }}>{img.repository}</strong>
                  </Td>
                  <Td dataLabel="Tag">
                    <code style={{ fontSize: '0.85rem' }}>{img.tag}</code>
                  </Td>
                  <Td dataLabel="Image ID">
                    <HashId id={img.id} shortId={img.shortId} />
                  </Td>
                  <Td dataLabel="Size">
                    <span style={{ fontSize: '0.85rem' }}>{img.size}</span>
                  </Td>
                  <Td dataLabel="Usage">
                    <StatusBadge variant={img.inUse ? 'blue' : 'grey'}>
                      {img.inUse ? 'In Use' : 'Unused'}
                    </StatusBadge>
                  </Td>
                  <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                    <Flex justifyContent={{ default: 'justifyContentFlexEnd' }} spaceItems={{ default: 'spaceItemsXs' }}>
                      <Tooltip content="Inspect Image Details">
                        <Button
                          variant="plain"
                          icon={<InfoCircleIcon />}
                          onClick={() => onOpenInspect('image', img.id, `${img.repository}:${img.tag}`)}
                          aria-label="Inspect image"
                        />
                      </Tooltip>
                      <Tooltip content={img.inUse ? 'Cannot delete an image currently in use by a container' : 'Delete image'}>
                        <Button
                          variant="plain"
                          icon={<TrashIcon style={{ color: img.inUse ? '#8b949e' : 'var(--pf-v5-global--danger-color--100, #ff5555)' }} />}
                          isDisabled={img.inUse || isLoading}
                          onClick={() => onDelete(img)}
                          aria-label="Delete image"
                        />
                      </Tooltip>
                    </Flex>
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
