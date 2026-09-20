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
  Tooltip,
} from '@patternfly/react-core';
import { TrashIcon, InfoCircleIcon } from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { ImageItem } from '../types';

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

  const filteredImages = images.filter(
    (img) =>
      img.repository.toLowerCase().includes(filterText.toLowerCase()) ||
      img.tag.toLowerCase().includes(filterText.toLowerCase()) ||
      img.shortId.toLowerCase().includes(filterText.toLowerCase())
  );

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
        <EmptyState
          titleText="No Images Found"
          headingLevel="h4"
        >
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
                <Th width={30}>Repository</Th>
                <Th width={15}>Tag</Th>
                <Th width={15}>Image ID</Th>
                <Th width={15}>Size</Th>
                <Th width={10}>Usage</Th>
                <Th width={15} style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredImages.map((img) => (
                <Tr key={img.id}>
                  <Td dataLabel="Repository">
                    <strong style={{ fontSize: '0.95rem' }}>{img.repository}</strong>
                  </Td>
                  <Td dataLabel="Tag">
                    <code style={{ fontSize: '0.85rem' }}>{img.tag}</code>
                  </Td>
                  <Td dataLabel="Image ID">
                    <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{img.shortId}</span>
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
