import React, { useState } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Checkbox,
  Alert,
  List,
  ListItem,
} from '@patternfly/react-core';
import { EngineType } from '../types';

export interface SystemPruneModalProps {
  isOpen: boolean;
  activeEngine: EngineType;
  onPrune: (includeVolumes: boolean) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export const SystemPruneModal: React.FC<SystemPruneModalProps> = ({
  isOpen,
  activeEngine,
  onPrune,
  onClose,
  isLoading = false,
  error = null,
}) => {
  const [includeVolumes, setIncludeVolumes] = useState(false);

  if (!isOpen) {
    return null;
  }

  const engineName = activeEngine === 'podman' ? 'Podman' : 'Docker';

  return (
    <Modal
      variant={ModalVariant.medium}
      title={`System Prune (${engineName})`}
      titleIconVariant="warning"
      isOpen={isOpen}
      onClose={onClose}
      appendTo={() => document.body}
      actions={[
        <Button
          key="confirm"
          variant="danger"
          isLoading={isLoading}
          isDisabled={isLoading}
          onClick={() => onPrune(includeVolumes)}
        >
          Prune System Resources
        </Button>,
        <Button key="cancel" variant="link" isDisabled={isLoading} onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      {error && (
        <Alert variant="danger" isInline title="Prune Error" style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}

      <p style={{ marginBottom: '1rem' }}>
        System prune will reclaim disk space by removing unused objects across the entire {engineName} engine:
      </p>

      <List style={{ marginBottom: '1.25rem' }}>
        <ListItem>All stopped containers</ListItem>
        <ListItem>All networks not used by at least one container</ListItem>
        <ListItem>All dangling / unreferenced images and build caches</ListItem>
        {includeVolumes && (
          <ListItem style={{ color: 'var(--pf-v5-global--danger-color--100, #ff5555)', fontWeight: 600 }}>
            All unused anonymous and named persistent volumes
          </ListItem>
        )}
      </List>

      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
          borderRadius: '6px',
          border: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
        }}
      >
        <Checkbox
          id="prune-volumes-checkbox"
          label={
            <span>
              <strong>Include unused volumes</strong> (<code>--volumes</code>)
            </span>
          }
          description="Warning: Any volume not currently attached to a running container will be permanently destroyed."
          isChecked={includeVolumes}
          onChange={(_event, checked) => setIncludeVolumes(checked)}
          isDisabled={isLoading}
        />
      </div>
    </Modal>
  );
};
