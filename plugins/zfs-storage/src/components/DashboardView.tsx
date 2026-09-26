import React, { useState } from "react";
import {
  PageSection,
  Card,
  CardTitle,
  CardBody,
  Grid,
  GridItem,
  Progress,
  ProgressMeasureLocation,
  Button,
  Flex,
  FlexItem,
  Alert,
  Title,
  Label,
  Divider,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from "@patternfly/react-table";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  PlusCircleIcon,
  DownloadIcon,
  ArrowRightIcon,
  HddIcon,
  InfoCircleIcon,
  SyncAltIcon,
} from "@patternfly/react-icons";
import { ZPool, SystemInfo, DiskDevice } from "../types";
import { formatBytes, formatPercentage } from "../utils/formatters";

interface DashboardViewProps {
  systemInfo: SystemInfo | null;
  pools: ZPool[];
  disks: DiskDevice[];
  onSelectPool: (poolName: string) => void;
  onCreatePool: () => void;
  onImportPool: () => void;
  onViewArcDetails: () => void;
  onViewSmartDetails: (disk: DiskDevice) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  systemInfo,
  pools,
  disks,
  onSelectPool,
  onCreatePool,
  onImportPool,
  onViewArcDetails,
  onViewSmartDetails,
}) => {
  const [diskSortIndex, setDiskSortIndex] = useState<number | null>(0);
  const [diskSortDirection, setDiskSortDirection] = useState<'asc' | 'desc'>('asc');

  const getDiskSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: diskSortIndex ?? undefined,
      direction: diskSortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setDiskSortIndex(index);
      setDiskSortDirection(direction);
    },
    columnIndex,
  });

  const sortedDisks = React.useMemo(() => {
    if (diskSortIndex === null) {
      return disks;
    }
    return [...disks].sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';
      if (diskSortIndex === 0) {
        aVal = a.name;
        bVal = b.name;
      } else if (diskSortIndex === 1) {
        aVal = `${a.model || ''} ${a.serial || ''}`;
        bVal = `${b.model || ''} ${b.serial || ''}`;
      } else if (diskSortIndex === 2) {
        return diskSortDirection === 'asc' ? a.size - b.size : b.size - a.size;
      } else if (diskSortIndex === 3) {
        aVal = a.rotational ? 'HDD' : 'SSD';
        bVal = b.rotational ? 'HDD' : 'SSD';
      } else if (diskSortIndex === 4) {
        aVal = a.smart_health || '';
        bVal = b.smart_health || '';
      } else if (diskSortIndex === 5) {
        const aTemp = a.temperature ?? -999;
        const bTemp = b.temperature ?? -999;
        return diskSortDirection === 'asc' ? aTemp - bTemp : bTemp - aTemp;
      } else if (diskSortIndex === 6) {
        aVal = a.pool || '';
        bVal = b.pool || '';
      }
      return diskSortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [disks, diskSortIndex, diskSortDirection]);

  const totalSize = pools.reduce((acc, p) => acc + p.size, 0);
  const totalAlloc = pools.reduce((acc, p) => acc + p.alloc, 0);
  const totalFree = pools.reduce((acc, p) => acc + p.free, 0);
  const totalUsagePct = totalSize > 0 ? (totalAlloc / totalSize) * 100 : 0;

  const allHealthy = pools.length > 0 && pools.every((p) => p.health === "ONLINE");
  const faultedPools = pools.filter((p) => p.health !== "ONLINE");

  const sanoidInfo = systemInfo?.sanoid;

  return (
    <>
      {/* Top Header */}
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              ZFS Storage
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
        {faultedPools.length > 0 && (
          <Alert
            variant="warning"
            isInline
            title={`${faultedPools.length} pool(s) require attention`}
            style={{ marginBottom: "1.5rem" }}
          >
            {faultedPools.map((p) => `${p.name} (${p.health})`).join(", ")}
          </Alert>
        )}

        {/* 4 Overview Metric Cards */}
        <Grid hasGutter style={{ marginBottom: "2rem" }}>
          {/* Card 1: Health */}
          <GridItem span={6} md={3}>
            <Card isFullHeight isPlain style={{ border: "1px solid #333333" }}>
              <CardTitle>Health</CardTitle>
              <CardBody>
                <Flex alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "0.75rem" }}>
                  <FlexItem>
                    {allHealthy ? (
                      <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)", fontSize: "1.5rem" }} />
                    ) : pools.length === 0 ? (
                      <CheckCircleIcon style={{ color: "var(--pf-v5-global--Color--200)", fontSize: "1.5rem" }} />
                    ) : (
                      <ExclamationTriangleIcon style={{ color: "var(--pf-v5-global--warning-color--100)", fontSize: "1.5rem" }} />
                    )}
                  </FlexItem>
                  <FlexItem>
                    <Title headingLevel="h3" size="lg">
                      {pools.length === 0 ? "No pools configured" : allHealthy ? "All pools online" : "Degraded pools"}
                    </Title>
                  </FlexItem>
                </Flex>
                <div style={{ color: "var(--pf-v5-global--Color--200)", fontSize: "0.875rem" }}>
                  {pools.length} active pool(s) configured
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 2: Storage Usage */}
          <GridItem span={6} md={3}>
            <Card isFullHeight isPlain style={{ border: "1px solid #333333" }}>
              <CardTitle>Storage usage</CardTitle>
              <CardBody>
                <Title headingLevel="h3" size="xl" style={{ marginBottom: "0.5rem" }}>
                  {formatBytes(totalAlloc)} <span style={{ fontSize: "0.875rem", color: "var(--pf-v5-global--Color--200)" }}>of {formatBytes(totalSize)}</span>
                </Title>
                <Progress
                  value={totalUsagePct}
                  title="Allocated space"
                  measureLocation={ProgressMeasureLocation.none}
                  style={{ marginBottom: "0.5rem" }}
                />
                <div style={{ fontSize: "0.875rem", color: "var(--pf-v5-global--Color--200)" }}>
                  {formatBytes(totalFree)} available
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 3: ARC Memory Cache (Clickable) */}
          <GridItem span={6} md={3}>
            <Card
              isFullHeight
              isPlain
              isHoverable
              onClick={onViewArcDetails}
              style={{ border: "1px solid #333333", cursor: "pointer" }}
            >
              <CardTitle>
                <Flex justifyContent={{ default: "justifyContentSpaceBetween" }}>
                  <FlexItem>ARC Cache</FlexItem>
                  <FlexItem>
                    <InfoCircleIcon style={{ color: "rgb(146, 197, 249)" }} />
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                {systemInfo?.arc ? (
                  <>
                    <Title headingLevel="h3" size="xl" style={{ marginBottom: "0.5rem" }}>
                      {formatBytes(systemInfo.arc.size)}{" "}
                      <span style={{ fontSize: "0.875rem", color: "var(--pf-v5-global--Color--200)" }}>
                        / {formatBytes(systemInfo.arc.target_size)}
                      </span>
                    </Title>
                    <Progress
                      value={(systemInfo.arc.hit_ratio || 0) * 100}
                      title="Hit rate"
                      measureLocation={ProgressMeasureLocation.none}
                      style={{ marginBottom: "0.5rem" }}
                    />
                    <div style={{ fontSize: "0.875rem", color: "var(--pf-v5-global--Color--200)" }}>
                      {formatPercentage((systemInfo.arc.hit_ratio || 0) * 100)} hit rate ({systemInfo.arc.hits?.toLocaleString() || 0} hits)
                    </div>
                  </>
                ) : (
                  <div style={{ color: "var(--pf-v5-global--Color--200)", fontSize: "0.875rem" }}>
                    ARC statistics not available
                  </div>
                )}
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 4: System Information */}
          <GridItem span={6} md={3}>
            <Card isFullHeight isPlain style={{ border: "1px solid #333333" }}>
              <CardTitle>ZFS Subsystem</CardTitle>
              <CardBody>
                <div style={{ marginBottom: "0.5rem" }}>
                  <Label color={systemInfo?.kernel_module_loaded ? "green" : "grey"}>
                    {systemInfo?.kernel_module_loaded ? "Kernel module loaded" : "Module not loaded"}
                  </Label>
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--pf-v5-global--Color--200)" }}>
                  Native OpenZFS kernel driver active
                </div>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* Active Pools Section */}
        <Title headingLevel="h2" size="xl" style={{ marginBottom: "1rem", fontWeight: 600 }}>
          Storage Pools
        </Title>

        <Grid hasGutter style={{ marginBottom: "2rem" }}>
          {pools.map((pool) => {
            const usagePct = pool.size > 0 ? (pool.alloc / pool.size) * 100 : 0;
            const isOnline = pool.health === "ONLINE";

            return (
              <GridItem key={pool.name} span={12} md={6}>
                <Card
                  isHoverable
                  isPlain
                  onClick={() => onSelectPool(pool.name)}
                  style={{
                    border: "1px solid #333333",
                    cursor: "pointer",
                  }}
                >
                  <CardTitle>
                    <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                      <FlexItem>
                        <Flex alignItems={{ default: "alignItemsCenter" }}>
                          <FlexItem>
                            {isOnline ? (
                              <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)", marginRight: "0.5rem" }} />
                            ) : (
                              <ExclamationCircleIcon style={{ color: "var(--pf-v5-global--danger-color--100)", marginRight: "0.5rem" }} />
                            )}
                          </FlexItem>
                          <FlexItem>
                            <Title headingLevel="h3" size="lg" style={{ fontWeight: 600 }}>
                              {pool.name}
                            </Title>
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                      <FlexItem>
                        <Label color={isOnline ? "green" : "red"}>{pool.health}</Label>
                      </FlexItem>
                    </Flex>
                  </CardTitle>
                  <CardBody>
                    <Progress
                      value={usagePct}
                      title={`${formatBytes(pool.alloc)} of ${formatBytes(pool.size)} used`}
                      measureLocation={ProgressMeasureLocation.top}
                      style={{ marginBottom: "1rem" }}
                    />
                    <Grid hasGutter style={{ fontSize: "0.875rem" }}>
                      <GridItem span={4}>
                        <span style={{ color: "var(--pf-v5-global--Color--200)" }}>Free:</span>{" "}
                        <strong>{formatBytes(pool.free)}</strong>
                      </GridItem>
                      <GridItem span={4}>
                        <span style={{ color: "var(--pf-v5-global--Color--200)" }}>Fragmentation:</span>{" "}
                        <strong>{pool.frag}%</strong>
                      </GridItem>
                      <GridItem span={4}>
                        <span style={{ color: "var(--pf-v5-global--Color--200)" }}>Deduplication:</span>{" "}
                        <strong>{pool.dedup}x</strong>
                      </GridItem>
                    </Grid>

                    {pool.scan && pool.scan.function !== "none" && (
                      <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--pf-v5-global--Color--200)" }}>
                        <strong>{pool.scan.function === "scrub" ? "Scrub" : "Resilver"}:</strong>{" "}
                        {pool.scan.state === "in_progress" ? `In progress (${pool.scan.percentage}%)` : "Completed"}
                      </div>
                    )}

                    <Divider style={{ marginTop: "1rem", marginBottom: "0.75rem" }} />
                    <Button variant="link" isInline icon={<ArrowRightIcon />} iconPosition="end">
                      Configure pool
                    </Button>
                  </CardBody>
                </Card>
              </GridItem>
            );
          })}
        </Grid>

        {/* Sanoid & Syncoid Jobs (Shown only if installed) */}
        {sanoidInfo?.installed && (
          <div style={{ marginBottom: "2rem" }}>
            <Title headingLevel="h2" size="xl" style={{ marginBottom: "1rem", fontWeight: 600 }}>
              Sanoid &amp; Syncoid Snapshot Automations
            </Title>
            <Card isPlain style={{ border: "1px solid #333333" }}>
              <CardBody>
                <Flex gap={{ default: "gapMd" }} style={{ marginBottom: "1rem" }}>
                  {sanoidInfo.sanoid_installed && (
                    <FlexItem>
                      <Label color={sanoidInfo.sanoid_timer_active ? "green" : "grey"} icon={<SyncAltIcon />}>
                        Sanoid Timer: {sanoidInfo.sanoid_timer_active ? "Active" : "Inactive"}
                      </Label>
                    </FlexItem>
                  )}
                  {sanoidInfo.syncoid_installed && (
                    <FlexItem>
                      <Label color={sanoidInfo.syncoid_timer_active ? "green" : "grey"} icon={<SyncAltIcon />}>
                        Syncoid Timer: {sanoidInfo.syncoid_timer_active ? "Active" : "Inactive"}
                      </Label>
                    </FlexItem>
                  )}
                </Flex>

                {sanoidInfo.policies.length > 0 ? (
                  <Table aria-label="Sanoid Policies Table" variant="compact">
                    <Thead>
                      <Tr>
                        <Th>Dataset / Path</Th>
                        <Th>Template</Th>
                        <Th>Hourly</Th>
                        <Th>Daily</Th>
                        <Th>Monthly</Th>
                        <Th>Yearly</Th>
                        <Th>Autosnap / Autoprune</Th>
                        <Th>Recursive</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {sanoidInfo.policies.map((p) => (
                        <Tr key={p.dataset}>
                          <Td dataLabel="Dataset"><strong>{p.dataset}</strong></Td>
                          <Td dataLabel="Template">{p.template || "default"}</Td>
                          <Td dataLabel="Hourly">{p.hourly !== undefined ? p.hourly : "—"}</Td>
                          <Td dataLabel="Daily">{p.daily !== undefined ? p.daily : "—"}</Td>
                          <Td dataLabel="Monthly">{p.monthly !== undefined ? p.monthly : "—"}</Td>
                          <Td dataLabel="Yearly">{p.yearly !== undefined ? p.yearly : "—"}</Td>
                          <Td dataLabel="Autosnap / Autoprune">
                            <Flex gap={{ default: "gapXs" }}>
                              <Label color={p.autosnap !== false ? "green" : "grey"}>Snap: {p.autosnap !== false ? "on" : "off"}</Label>
                              <Label color={p.autoprune !== false ? "blue" : "grey"}>Prune: {p.autoprune !== false ? "on" : "off"}</Label>
                            </Flex>
                          </Td>
                          <Td dataLabel="Recursive">{p.recursive ? "Yes" : "No"}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                ) : (
                  <div style={{ color: "var(--pf-v5-global--Color--200)", fontSize: "0.875rem" }}>
                    Sanoid is installed, but no dataset policies are configured in /etc/sanoid/sanoid.conf.
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* Host Disks Overview Section */}
        <Title headingLevel="h2" size="xl" style={{ marginBottom: "1rem", fontWeight: 600 }}>
          Host Disks Overview
        </Title>

        <Card isPlain style={{ border: "1px solid #333333" }}>
          <CardBody style={{ padding: 0 }}>
            <Table aria-label="Dashboard Disks Table" variant="compact">
              <Thead>
                <Tr>
                  <Th sort={getDiskSortParams(0)}>Device</Th>
                  <Th sort={getDiskSortParams(1)}>Model / Serial</Th>
                  <Th sort={getDiskSortParams(2)}>Capacity</Th>
                  <Th sort={getDiskSortParams(3)}>Type</Th>
                  <Th sort={getDiskSortParams(4)}>SMART Health</Th>
                  <Th sort={getDiskSortParams(5)}>Temp</Th>
                  <Th sort={getDiskSortParams(6)}>Pool Assignment</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sortedDisks.map((disk) => {
                  const isSmartPassed = disk.smart_health === "PASSED";
                  const isSmartFailed = disk.smart_health === "FAILED";

                  return (
                    <Tr key={disk.name}>
                      <Td dataLabel="Device">
                        <Button
                          variant="link"
                          isInline
                          onClick={() => onViewSmartDetails(disk)}
                          style={{ textAlign: "left" }}
                        >
                          <Flex alignItems={{ default: "alignItemsCenter" }}>
                            <FlexItem>
                              <HddIcon style={{ color: "rgb(146, 197, 249)" }} />
                            </FlexItem>
                            <FlexItem>
                              <strong>{disk.name}</strong>
                              <span style={{ fontSize: "0.8rem", color: "#999999", marginLeft: "0.4rem" }}>
                                ({disk.path})
                              </span>
                            </FlexItem>
                          </Flex>
                        </Button>
                      </Td>
                      <Td dataLabel="Model">{disk.model || disk.serial || "-"}</Td>
                      <Td dataLabel="Capacity">{formatBytes(disk.size)}</Td>
                      <Td dataLabel="Type">
                        <Label color="grey">{disk.rotational ? "HDD" : "SSD"}</Label>
                      </Td>
                      <Td dataLabel="SMART Health">
                        <Flex alignItems={{ default: "alignItemsCenter" }}>
                          <FlexItem>
                            {isSmartPassed ? (
                              <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)" }} />
                            ) : isSmartFailed ? (
                              <ExclamationCircleIcon style={{ color: "var(--pf-v5-global--danger-color--100)" }} />
                            ) : (
                              <span style={{ color: "#999999" }}>-</span>
                            )}
                          </FlexItem>
                          <FlexItem>
                            <span style={{ marginLeft: "0.25rem" }}>{disk.smart_health || "Unknown"}</span>
                          </FlexItem>
                        </Flex>
                      </Td>
                      <Td dataLabel="Temp">{disk.temperature !== null && disk.temperature !== undefined ? `${disk.temperature} °C` : "-"}</Td>
                      <Td dataLabel="Pool Assignment">
                        {disk.pool ? (
                          <Label color="blue">{disk.pool}</Label>
                        ) : (
                          <span style={{ color: "#999999" }}>Unallocated</span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};

