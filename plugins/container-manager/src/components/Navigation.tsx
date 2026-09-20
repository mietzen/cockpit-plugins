import React from 'react';
import {
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem,
  Button,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Tooltip,
} from '@patternfly/react-core';
import { SyncAltIcon, TrashIcon } from '@patternfly/react-icons';
import { StatusBadge } from '@cockpit-plugins/common';
import { EnginesDetection, EngineType } from '../types';

export interface NavigationProps {
  activeView: string;
  onSelectView: (view: string) => void;
  engines: EnginesDetection;
  activeEngine: EngineType;
  onSelectEngine: (engine: EngineType) => void;
  onRefresh: () => void;
  onOpenSystemPrune: () => void;
  isLoading: boolean;
  containerCount?: number;
  imageCount?: number;
  volumeCount?: number;
  networkCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeView,
  onSelectView,
  engines,
  activeEngine,
  onSelectEngine,
  onRefresh,
  onOpenSystemPrune,
  isLoading,
  containerCount = 0,
  imageCount = 0,
  volumeCount = 0,
  networkCount = 0,
}) => {
  const [engineDropdownOpen, setEngineDropdownOpen] = React.useState(false);
  const activeEngineInfo = engines[activeEngine as 'docker' | 'podman'];
  const hasMultipleEngines = engines.docker.installed && engines.podman.installed;

  return (
    <div className="cockpit-top-nav-sticky-wrapper">
      <div className="cockpit-top-nav-bar">
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} flexWrap={{ default: 'wrap' }}>
          <FlexItem>
            <Tabs
              activeKey={activeView}
              onSelect={(_event, tabKey) => onSelectView(String(tabKey))}
              isBox={false}
            >
              <Tab eventKey="dashboard" title={<TabTitleText>Overview</TabTitleText>} />
              <Tab
                eventKey="containers"
                title={<TabTitleText>{containerCount > 0 ? `Containers (${containerCount})` : 'Containers'}</TabTitleText>}
              />
              <Tab
                eventKey="images"
                title={<TabTitleText>{imageCount > 0 ? `Images (${imageCount})` : 'Images'}</TabTitleText>}
              />
              <Tab
                eventKey="volumes"
                title={<TabTitleText>{volumeCount > 0 ? `Volumes (${volumeCount})` : 'Volumes'}</TabTitleText>}
              />
              <Tab
                eventKey="networks"
                title={<TabTitleText>{networkCount > 0 ? `Networks (${networkCount})` : 'Networks'}</TabTitleText>}
              />
              <Tab eventKey="settings" title={<TabTitleText>Settings</TabTitleText>} />
            </Tabs>
          </FlexItem>

          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
              {activeEngine !== 'none' && (
                <FlexItem>
                  {hasMultipleEngines ? (
                    <Select
                      isOpen={engineDropdownOpen}
                      selected={activeEngine}
                      popperProps={{ appendTo: () => document.body }}
                      onSelect={(_event, value) => {
                        onSelectEngine(value as EngineType);
                        setEngineDropdownOpen(false);
                      }}
                      onOpenChange={(isOpen) => setEngineDropdownOpen(isOpen)}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          onClick={() => setEngineDropdownOpen(!engineDropdownOpen)}
                          isExpanded={engineDropdownOpen}
                        >
                          {activeEngine === 'docker' ? 'Docker' : 'Podman'} ({activeEngineInfo?.version || 'Active'})
                        </MenuToggle>
                      )}
                    >
                      <SelectOption key="docker" value="docker">
                        Docker ({engines.docker.version || 'installed'})
                      </SelectOption>
                      <SelectOption key="podman" value="podman">
                        Podman ({engines.podman.version || 'installed'})
                      </SelectOption>
                    </Select>
                  ) : (
                    <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsXs' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {activeEngine === 'docker' ? 'Docker' : 'Podman'} {activeEngineInfo?.version}
                      </span>
                      <StatusBadge variant={activeEngineInfo?.active ? 'green' : 'grey'}>
                        {activeEngineInfo?.active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </Flex>
                  )}
                </FlexItem>
              )}

              <Tooltip content="Purge unused containers, images, and networks">
                <Button
                  variant="secondary"
                  icon={<TrashIcon />}
                  onClick={onOpenSystemPrune}
                  isDisabled={isLoading || activeEngine === 'none'}
                  size="sm"
                >
                  System Prune
                </Button>
              </Tooltip>

              <Button
                variant="plain"
                icon={<SyncAltIcon className={isLoading ? 'pf-m-spin' : ''} />}
                onClick={onRefresh}
                aria-label="Refresh data"
                isDisabled={isLoading}
              >
                Refresh
              </Button>
            </Flex>
          </FlexItem>
        </Flex>
      </div>
    </div>
  );
};
