import React, { useState, useEffect } from "react";
import {
  PageSection,
  Title,
  Button,
  Flex,
  FlexItem,
  Progress,
  ProgressMeasureLocation,
  Label,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  SearchInput,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import {
  PlusCircleIcon,
  DownloadIcon,
  EllipsisVIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DatabaseIcon,
} from "@patternfly/react-icons";
import { ZPool } from "../types";
import { formatBytes } from "../utils/formatters";

interface PoolsViewProps {
  pools: ZPool[];
  isLoading?: boolean;
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
  isLoading = false,
  onSelectPool,
  onCreatePool,
  onImportPool,
  onDestroyPool,
  onExportPool,
  onScrubPool,
  onTrimPool,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");

  const toggleDropdown = (poolName: string) => {
    setOpenDropdown(openDropdown === poolName ? null : poolName);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__poolsViewHandlers = {
        toggleDropdown: toggleDropdown,
      };
    }
  });

  const filteredPools = pools.filter((p) =>
    p.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Pools
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={onCreatePool}>
                  Create pool
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<DownloadIcon />} onClick={onImportPool}>
                  Import pool
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {pools.length === 0 ? (
          isLoading ? null : (
            <EmptyState>
              <EmptyStateHeader
                titleText="No ZFS storage pools configured"
                icon={<EmptyStateIcon icon={DatabaseIcon} />}
                headingLevel="h4"
              />
              <EmptyStateBody>
                You don't have any OpenZFS storage pools active on this system. Create a new pool using available host disks or import an existing pool.
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" icon={<PlusCircleIcon />} onClick={onCreatePool}>
                    Create pool
                  </Button>
                  <Button variant="link" icon={<DownloadIcon />} onClick={onImportPool}>
                    Import pool
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          )
        ) : (
          <>
            <div style={{ maxWidth: "350px", marginBottom: "1rem" }}>
              <SearchInput
                placeholder="Filter pools by name..."
                value={searchValue}
                onChange={(_event, value) => setSearchValue(value)}
                onClear={() => setSearchValue("")}
              />
            </div>

            <div style={{ borderRadius: "16px", border: "1px solid var(--zfs-card-border)", overflow: "hidden", backgroundColor: "var(--zfs-card-bg)" }}>
              <Table aria-label="ZFS Pools Table" variant="compact" style={{ border: "none", marginBottom: 0 }}>
                <Thead>
                  <Tr>
                    <Th width={20}>Name</Th>
                    <Th width={15}>Health</Th>
                    <Th width={25}>Capacity usage</Th>
                    <Th width={15}>Free</Th>
                    <Th width={10}>Fragmentation</Th>
                    <Th width={10}>Deduplication</Th>
                    <Th width={15}>Maintenance</Th>
                    <Th width={5} screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredPools.map((pool) => {
                    const usagePct = pool.size > 0 ? (pool.alloc / pool.size) * 100 : 0;
                    const isScrubbing = pool.scan?.function === "scrub" && pool.scan?.state === "in_progress";
                    const isOnline = pool.health === "ONLINE";

                    return (
                      <Tr key={pool.name}>
                        <Td dataLabel="Name">
                          <Button variant="link" isInline onClick={() => onSelectPool(pool.name)}>
                            <strong>{pool.name}</strong>
                          </Button>
                        </Td>
                        <Td dataLabel="Health">
                          <Flex alignItems={{ default: "alignItemsCenter" }}>
                            <FlexItem>
                              {isOnline ? (
                                <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)" }} />
                              ) : (
                                <ExclamationTriangleIcon style={{ color: "var(--pf-v5-global--warning-color--100)" }} />
                              )}
                            </FlexItem>
                            <FlexItem>
                              <span style={{ marginLeft: "0.25rem" }}>{pool.health}</span>
                            </FlexItem>
                          </Flex>
                        </Td>
                        <Td dataLabel="Capacity usage">
                          <span>
                            {formatBytes(pool.alloc)} / {formatBytes(pool.size)} ({Math.round(usagePct)}%)
                          </span>
                        </Td>
                        <Td dataLabel="Free">{formatBytes(pool.free)}</Td>
                        <Td dataLabel="Fragmentation">{pool.frag}%</Td>
                        <Td dataLabel="Deduplication">{pool.dedup}x</Td>
                        <Td dataLabel="Maintenance">
                          {pool.scan?.function === "scrub" ? (
                            isScrubbing ? (
                              <Label color="orange">Scrubbing {pool.scan?.percentage}%</Label>
                            ) : (
                              <span style={{ color: "#999999" }}>Verified</span>
                            )
                          ) : (
                            <span style={{ color: "#999999" }}>None</span>
                          )}
                        </Td>
                        <Td isActionCell>
                          <Dropdown
                            popperProps={{ position: "right", preventOverflow: true, appendTo: () => document.body }}
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
                                View topology
                              </DropdownItem>
                              <DropdownItem key="datasets" onClick={() => onSelectPool(pool.name, "datasets")}>
                                View datasets &amp; volumes
                              </DropdownItem>
                              <DropdownItem key="snaps" onClick={() => onSelectPool(pool.name, "snapshots")}>
                                View snapshots
                              </DropdownItem>
                              <DropdownItem
                                key="scrub"
                                onClick={() => onScrubPool(pool, isScrubbing ? "stop" : "start")}
                              >
                                {isScrubbing ? "Stop scrub" : "Start scrub"}
                              </DropdownItem>
                              <DropdownItem key="trim" onClick={() => onTrimPool(pool, "start")}>
                                Start trim
                              </DropdownItem>
                              <DropdownItem key="settings" onClick={() => onSelectPool(pool.name, "settings")}>
                                Pool properties
                              </DropdownItem>
                              <DropdownItem key="export" onClick={() => onExportPool(pool)}>
                                Export pool
                              </DropdownItem>
                              <DropdownItem key="destroy" style={{ color: "red" }} onClick={() => onDestroyPool(pool)}>
                                Destroy pool
                              </DropdownItem>
                            </DropdownList>
                          </Dropdown>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>
          </>
        )}
      </PageSection>
    </>
  );
};
