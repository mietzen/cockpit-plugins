import React, { useState } from "react";
import {
  PageSection,
  Title,
  Button,
  Flex,
  FlexItem,
  Progress,
  ProgressMeasureLocation,
  Badge,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { PlusCircleIcon, DownloadIcon, EllipsisVIcon } from "@patternfly/react-icons";
import { ZPool } from "../types";
import { formatBytes, getHealthBadgeColor } from "../utils/formatters";

interface PoolsViewProps {
  pools: ZPool[];
  onSelectPool: (poolName: string, subTab?: string) => void;
  onCreatePool: () => void;
  onImportPool: () => void;
  onDestroyPool: (pool: ZPool) => void;
  onExportPool: (pool: ZPool) => void;
  onScrubPool: (pool: ZPool, action: "start" | "stop" | "pause") => void;
  onTrimPool: (pool: ZPool, action: "start" | "stop") => void;
}

export const PoolsView: React.FC<PoolsViewProps> = ({
  pools,
  onSelectPool,
  onCreatePool,
  onImportPool,
  onDestroyPool,
  onExportPool,
  onScrubPool,
  onTrimPool,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (poolName: string) => {
    setOpenDropdown(openDropdown === poolName ? null : poolName);
  };

  return (
    <>
      <PageSection variant="light">
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              ZFS Pools
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={onCreatePool}>
                  Create Pool
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<DownloadIcon />} onClick={onImportPool}>
                  Import Pool
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <Table aria-label="ZFS Pools Table" variant="compact">
          <Thead>
            <Tr>
              <Th>Pool Name</Th>
              <Th>Health</Th>
              <Th style={{ width: "250px" }}>Capacity Usage</Th>
              <Th>Free</Th>
              <Th>Frag</Th>
              <Th>Dedup</Th>
              <Th>Scrub Status</Th>
              <Th aria-label="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {pools.map((pool) => {
              const usagePct = pool.size > 0 ? (pool.alloc / pool.size) * 100 : 0;
              const isScrubbing = pool.scan?.function === "scrub" && pool.scan?.state === "in_progress";

              return (
                <Tr key={pool.name}>
                  <Td dataLabel="Pool Name">
                    <Button variant="link" isInline onClick={() => onSelectPool(pool.name)}>
                      <strong>{pool.name}</strong>
                    </Button>
                  </Td>
                  <Td dataLabel="Health">
                    <Badge
                      style={{
                        backgroundColor:
                          getHealthBadgeColor(pool.health) === "success"
                            ? "var(--pf-v5-global--success-color--100)"
                            : getHealthBadgeColor(pool.health) === "warning"
                            ? "var(--pf-v5-global--warning-color--100)"
                            : "var(--pf-v5-global--danger-color--100)",
                        color: "white",
                      }}
                    >
                      {pool.health}
                    </Badge>
                  </Td>
                  <Td dataLabel="Capacity Usage">
                    <Progress
                      value={usagePct}
                      title={`${formatBytes(pool.alloc)} / ${formatBytes(pool.size)}`}
                      measureLocation={ProgressMeasureLocation.top}
                    />
                  </Td>
                  <Td dataLabel="Free">{formatBytes(pool.free)}</Td>
                  <Td dataLabel="Frag">{pool.frag}%</Td>
                  <Td dataLabel="Dedup">{pool.dedup}x</Td>
                  <Td dataLabel="Scrub Status">
                    {pool.scan?.function === "scrub" ? (
                      isScrubbing ? (
                        <span style={{ color: "orange" }}>Scrubbing ({pool.scan?.percentage}%)</span>
                      ) : (
                        <span>Completed</span>
                      )
                    ) : (
                      <span style={{ color: "gray" }}>None</span>
                    )}
                  </Td>
                  <Td isActionCell>
                    <Dropdown
                      isOpen={openDropdown === pool.name}
                      onSelect={() => setOpenDropdown(null)}
                      onOpenChange={(isOpen) => setOpenDropdown(isOpen ? pool.name : null)}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          aria-label="Pool actions"
                          variant="plain"
                          onClick={() => toggleDropdown(pool.name)}
                          isExpanded={openDropdown === pool.name}
                        >
                          <EllipsisVIcon />
                        </MenuToggle>
                      )}
                    >
                      <DropdownList>
                        <DropdownItem key="topo" onClick={() => onSelectPool(pool.name, "topology")}>
                          View Topology
                        </DropdownItem>
                        <DropdownItem key="datasets" onClick={() => onSelectPool(pool.name, "datasets")}>
                          View Datasets
                        </DropdownItem>
                        <DropdownItem key="snaps" onClick={() => onSelectPool(pool.name, "snapshots")}>
                          View Snapshots
                        </DropdownItem>
                        <DropdownItem
                          key="scrub"
                          onClick={() => onScrubPool(pool, isScrubbing ? "stop" : "start")}
                        >
                          {isScrubbing ? "Stop Scrub" : "Start Scrub"}
                        </DropdownItem>
                        <DropdownItem key="trim" onClick={() => onTrimPool(pool, "start")}>
                          Start Trim
                        </DropdownItem>
                        <DropdownItem key="settings" onClick={() => onSelectPool(pool.name, "settings")}>
                          Pool Settings
                        </DropdownItem>
                        <DropdownItem key="export" onClick={() => onExportPool(pool)}>
                          Export Pool
                        </DropdownItem>
                        <DropdownItem key="destroy" style={{ color: "red" }} onClick={() => onDestroyPool(pool)}>
                          Destroy Pool
                        </DropdownItem>
                      </DropdownList>
                    </Dropdown>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </PageSection>
    </>
  );
};
