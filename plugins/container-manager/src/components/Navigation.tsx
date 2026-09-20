import React from 'react';
import {
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem,
  Button,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';

export interface NavigationProps {
  activeView: string;
  onSelectView: (view: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  containerCount?: number;
  imageCount?: number;
  volumeCount?: number;
  networkCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeView,
  onSelectView,
  onRefresh,
  isLoading,
  containerCount = 0,
  imageCount = 0,
  volumeCount = 0,
  networkCount = 0,
}) => {
  return (
    <div className="cockpit-top-nav-sticky-wrapper">
      <div className="cockpit-top-nav-bar">
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
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
            <Button
              variant="plain"
              icon={<SyncAltIcon className={isLoading ? 'pf-m-spin' : ''} />}
              onClick={onRefresh}
              aria-label="Refresh data"
              isDisabled={isLoading}
            >
              Refresh
            </Button>
          </FlexItem>
        </Flex>
      </div>
    </div>
  );
};
