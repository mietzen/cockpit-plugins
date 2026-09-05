import React from 'react';
import {
  Flex,
  FlexItem,
  Title,
  Button,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Tooltip,
} from '@patternfly/react-core';
import {
  SyncAltIcon,
  TrashIcon,
  LockIcon,
} from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { EnginesDetection, EngineType } from '../types';

export interface HeaderProps {
  engines: EnginesDetection;
  activeEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  onRefresh: () => void;
  onOpenSystemPrune: () => void;
  onOpenRemoteApi: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  engines,
  activeEngine,
  onSelectEngine,
  onRefresh,
  onOpenSystemPrune,
  onOpenRemoteApi,
  isLoading = false,
}) => {
  const [engineDropdownOpen, setEngineDropdownOpen] = React.useState(false);

  const activeEngineInfo = engines[activeEngine as 'docker' | 'podman'];
  const hasMultipleEngines = engines.docker.installed && engines.podman.installed;

  const onEngineToggle = () => {
    setEngineDropdownOpen(!engineDropdownOpen);
  };

  return (
    <div
      style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--pf-v5-global--BorderColor--100, #30363d)',
        backgroundColor: 'var(--pf-v5-global--BackgroundColor--100, #0d1117)',
      }}
    >
      <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'wrap' }}>
        <FlexItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsMd' }}>
            <FlexItem>
              <Title headingLevel="h1" size="2xl" style={{ margin: 0 }}>
                📦 Containers
              </Title>
            </FlexItem>

            {activeEngine !== 'none' && (
              <FlexItem>
                {hasMultipleEngines ? (
                  <Select
                    isOpen={engineDropdownOpen}
                    selected={activeEngine}
                    onSelect={(_event, value) => {
                      onSelectEngine(value as EngineType);
                      setEngineDropdownOpen(false);
                    }}
                    onOpenChange={(isOpen) => setEngineDropdownOpen(isOpen)}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle ref={toggleRef} onClick={onEngineToggle} isExpanded={engineDropdownOpen}>
                        {activeEngine === 'docker' ? '🐳 Docker' : '🦭 Podman'} ({activeEngineInfo?.version || 'Active'})
                      </MenuToggle>
                    )}
                  >
                    <SelectOption key="docker" value="docker">
                      🐳 Docker ({engines.docker.version || 'installed'})
                    </SelectOption>
                    <SelectOption key="podman" value="podman">
                      🦭 Podman ({engines.podman.version || 'installed'})
                    </SelectOption>
                  </Select>
                ) : (
                  <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsXs' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {activeEngine === 'docker' ? '🐳 Docker' : '🦭 Podman'} {activeEngineInfo?.version}
                    </span>
                    <StatusBadge variant={activeEngineInfo?.active ? 'green' : 'grey'}>
                      {activeEngineInfo?.active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </Flex>
                )}
              </FlexItem>
            )}
          </Flex>
        </FlexItem>

        <FlexItem>
          <Flex spaceItems={{ default: 'spaceItemsSm' }}>
            <Tooltip content="Configure TCP Socket and TLS mutual authentication">
              <Button
                variant="secondary"
                icon={<LockIcon />}
                onClick={onOpenRemoteApi}
                isDisabled={isLoading || activeEngine === 'none'}
              >
                Remote API & TLS
              </Button>
            </Tooltip>

            <Tooltip content="Purge unused containers, images, and networks">
              <Button
                variant="secondary"
                icon={<TrashIcon />}
                onClick={onOpenSystemPrune}
                isDisabled={isLoading || activeEngine === 'none'}
              >
                System Prune
              </Button>
            </Tooltip>

            <Tooltip content="Reload status">
              <Button
                variant="plain"
                icon={<SyncAltIcon />}
                onClick={onRefresh}
                isLoading={isLoading}
                aria-label="Refresh"
              />
            </Tooltip>
          </Flex>
        </FlexItem>
      </Flex>
    </div>
  );
};
