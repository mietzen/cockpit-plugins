import React from "react";
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
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  PlusCircleIcon,
  DownloadIcon,
  ArrowRightIcon,
} from "@patternfly/react-icons";
import { ZPool, SystemInfo } from "../types";
import { formatBytes, formatPercentage } from "../utils/formatters";

interface DashboardViewProps {
  systemInfo: SystemInfo | null;
  pools: ZPool[];
  onSelectPool: (poolName: string) => void;
  onCreatePool: () => void;
  onImportPool: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  systemInfo,
  pools,
  onSelectPool,
  onCreatePool,
  onImportPool,
}) => {
  const totalSize = pools.reduce((acc, p) => acc + p.size, 0);
  const totalAlloc = pools.reduce((acc, p) => acc + p.alloc, 0);
  const totalFree = pools.reduce((acc, p) => acc + p.free, 0);
  const totalUsagePct = totalSize > 0 ? (totalAlloc / totalSize) * 100 : 0;

  const allHealthy = pools.length > 0 && pools.every((p) => p.health === "ONLINE");
  const faultedPools = pools.filter((p) => p.health !== "ONLINE");

  return (
    <>
      {/* Top Header matching Cockpit Overview */}
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsBaseline" }}>
              <FlexItem>
                <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600 }}>
                  ZFS Storage
                </Title>
              </FlexItem>
              <FlexItem>
                <span style={{ color: "var(--pf-v5-global--Color--200)", marginLeft: "0.5rem" }}>
                  {systemInfo?.version ? systemInfo.version.split("\n")[0] : "OpenZFS"}
                </span>
              </FlexItem>
            </Flex>
          </FlexItem>
          <FlexItem>
            <Flex>
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

        {/* 4 Overview Metric Cards matching Cockpit Overview Layout */}
        <Grid hasGutter style={{ marginBottom: "1.5rem" }}>
          {/* Card 1: Health */}
          <GridItem span={6} md={3}>
            <Card isFullHeight isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)" }}>
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
            <Card isFullHeight isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)" }}>
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

          {/* Card 3: ARC Memory Cache */}
          <GridItem span={6} md={3}>
            <Card isFullHeight isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)" }}>
              <CardTitle>ARC Cache</CardTitle>
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
            <Card isFullHeight isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)" }}>
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

        <Grid hasGutter>
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
                    border: "1px solid var(--pf-v5-global--BorderColor--100)",
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
      </PageSection>
    </>
  );
};
