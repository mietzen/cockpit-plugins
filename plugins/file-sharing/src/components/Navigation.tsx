import React from "react";
import {
  Tabs,
  Tab,
  TabTitleText,
  Flex,
  FlexItem,
  Button,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";

interface NavigationProps {
  activeView: string;
  onSelectView: (view: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeView,
  onSelectView,
  onRefresh,
  isLoading,
}) => {
  return (
    <div className="cockpit-top-nav-sticky-wrapper">
      <div className="cockpit-top-nav-bar">
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Tabs
              activeKey={activeView}
              onSelect={(_event, tabKey) => onSelectView(String(tabKey))}
              isBox={false}
            >
              <Tab eventKey="dashboard" title={<TabTitleText>Overview</TabTitleText>} />
              <Tab eventKey="smb" title={<TabTitleText>SMB Shares</TabTitleText>} />
              <Tab eventKey="nfs" title={<TabTitleText>NFS Exports</TabTitleText>} />
              <Tab eventKey="users" title={<TabTitleText>Samba Users &amp; Permissions</TabTitleText>} />
              <Tab eventKey="sessions" title={<TabTitleText>Services &amp; Sessions</TabTitleText>} />
              <Tab eventKey="settings" title={<TabTitleText>Settings</TabTitleText>} />
            </Tabs>
          </FlexItem>

          <FlexItem>
            <Button
              variant="plain"
              icon={<SyncAltIcon className={isLoading ? "pf-m-spin" : ""} />}
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
