import React from "react";
import {
  Nav,
  NavItem,
  NavList,
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
    <div
      style={{
        borderBottom: "1px solid var(--pf-v5-global--BorderColor--100)",
        backgroundColor: "var(--pf-v5-global--BackgroundColor--100)",
        padding: "0 1.5rem",
      }}
    >
      <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
        <FlexItem>
          <Nav variant="horizontal">
            <NavList>
              <NavItem
                isActive={activeView === "dashboard"}
                onClick={() => onSelectView("dashboard")}
              >
                Dashboard
              </NavItem>
              <NavItem
                isActive={activeView === "pools" || activeView === "pool-details"}
                onClick={() => onSelectView("pools")}
              >
                Pools
              </NavItem>
              <NavItem
                isActive={activeView === "disks"}
                onClick={() => onSelectView("disks")}
              >
                Disks
              </NavItem>
              <NavItem
                isActive={activeView === "settings"}
                onClick={() => onSelectView("settings")}
              >
                Settings
              </NavItem>
            </NavList>
          </Nav>
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
  );
};
