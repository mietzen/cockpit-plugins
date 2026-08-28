import React from "react";
import {
  PageSection,
  Card,
  CardTitle,
  CardBody,
  CardFooter,
  Gallery,
  GalleryItem,
  Progress,
  ProgressMeasureLocation,
  Badge,
  Button,
  Flex,
  FlexItem,
  Alert,
  Title,
  Divider,
} from "@patternfly/react-core";
import {
  ServerIcon,
  DatabaseIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusCircleIcon,
  DownloadIcon,
} from "@patternfly/react-icons";
import { ZPool, SystemInfo } from "../types";
import { formatBytes, formatPercentage, getHealthBadgeColor } from "../utils/formatters";

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

  const faultedPools = pools.filter((p) => p.health !== "ONLINE");

  return (
    <>
      <PageSection variant="light">
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              ZFS Storage Dashboard
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
        {faultedPools.length > 0 && (
          <Alert
            variant="warning"
            title={`Attention: ${faultedPools.length} pool(s) require attention`}
            style={{ marginBottom: "1.5rem" }}
          >
            {faultedPools.map((p) => `${p.name} is ${p.health}`).join(", ")}
          </Alert>
        )}

        <Gallery hasGutter minWidths={{ default: "320px" }} style={{ marginBottom: "1.5rem" }}>
          {/* Total Storage Card */}
          <GalleryItem>
            <Card isFullHeight>
              <CardTitle>
                <Flex alignItems={{ default: "alignItemsCenter" }}>
                  <FlexItem>
                    <DatabaseIcon style={{ marginRight: "0.5rem" }} />
                  </FlexItem>
                  <FlexItem>Storage Capacity</FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <Title headingLevel="h2" size="3xl" style={{ marginBottom: "0.5rem" }}>
                  {formatBytes(totalAlloc)} <span style={{ fontSize: "1rem", color: "gray" }}>/ {formatBytes(totalSize)}</span>
                </Title>
                <Progress
                  value={totalUsagePct}
                  title="Allocated Space"
                  measureLocation={ProgressMeasureLocation.top}
                  style={{ marginBottom: "1rem" }}
                />
                <Flex justifyContent={{ default: "justifyContentSpaceBetween" }}>
                  <FlexItem>
                    <strong>Free:</strong> {formatBytes(totalFree)}
                  </FlexItem>
                  <FlexItem>
                    <strong>Pools:</strong> {pools.length}
                  </FlexItem>
                </Flex>
              </CardBody>
            </Card>
          </GalleryItem>

          {/* ARC Memory & Cache Card */}
          <GalleryItem>
            <Card isFullHeight>
              <CardTitle>
                <Flex alignItems={{ default: "alignItemsCenter" }}>
                  <FlexItem>
                    <ServerIcon style={{ marginRight: "0.5rem" }} />
                  </FlexItem>
                  <FlexItem>ARC Memory Cache</FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                {systemInfo?.arc ? (
                  <>
                    <Title headingLevel="h2" size="3xl" style={{ marginBottom: "0.5rem" }}>
                      {formatBytes(systemInfo.arc.size)}{" "}
                      <span style={{ fontSize: "1rem", color: "gray" }}>/ {formatBytes(systemInfo.arc.target_size)}</span>
                    </Title>
                    <Progress
                      value={(systemInfo.arc.hit_ratio || 0) * 100}
                      title={`Hit Rate (${formatPercentage((systemInfo.arc.hit_ratio || 0) * 100)})`}
                      measureLocation={ProgressMeasureLocation.top}
                      style={{ marginBottom: "1rem" }}
                    />
                    <Flex justifyContent={{ default: "justifyContentSpaceBetween" }}>
                      <FlexItem>
                        <strong>Hits:</strong> {systemInfo.arc.hits?.toLocaleString() || 0}
                      </FlexItem>
                      <FlexItem>
                        <strong>Misses:</strong> {systemInfo.arc.misses?.toLocaleString() || 0}
                      </FlexItem>
                    </Flex>
                  </>
                ) : (
                  <p>ARC cache stats not available</p>
                )}
              </CardBody>
            </Card>
          </GalleryItem>

          {/* ZFS System Info Card */}
          <GalleryItem>
            <Card isFullHeight>
              <CardTitle>
                <Flex alignItems={{ default: "alignItemsCenter" }}>
                  <FlexItem>
                    <CheckCircleIcon style={{ color: "green", marginRight: "0.5rem" }} />
                  </FlexItem>
                  <FlexItem>System Health</FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                <div style={{ marginBottom: "0.75rem" }}>
                  <strong>ZFS Module:</strong>{" "}
                  <Badge isRead={!systemInfo?.kernel_module_loaded}>
                    {systemInfo?.kernel_module_loaded ? "Loaded" : "Not Loaded"}
                  </Badge>
                </div>
                <div style={{ marginBottom: "0.75rem" }}>
                  <strong>Version:</strong>
                  <div style={{ fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-line" }}>
                    {systemInfo?.version || "Unknown"}
                  </div>
                </div>
              </CardBody>
            </Card>
          </GalleryItem>
        </Gallery>

        {/* Pools Summary Section */}
        <Title headingLevel="h2" size="xl" style={{ marginBottom: "1rem" }}>
          Active Pools
        </Title>
        <Gallery hasGutter minWidths={{ default: "340px" }}>
          {pools.map((pool) => {
            const usagePct = pool.size > 0 ? (pool.alloc / pool.size) * 100 : 0;
            return (
              <GalleryItem key={pool.name}>
                <Card isHoverable onClick={() => onSelectPool(pool.name)} style={{ cursor: "pointer" }}>
                  <CardTitle>
                    <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                      <FlexItem>
                        <Title headingLevel="h3" size="lg">
                          {pool.name}
                        </Title>
                      </FlexItem>
                      <FlexItem>
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
                      </FlexItem>
                    </Flex>
                  </CardTitle>
                  <CardBody>
                    <Progress
                      value={usagePct}
                      title={`Usage: ${formatBytes(pool.alloc)} of ${formatBytes(pool.size)}`}
                      measureLocation={ProgressMeasureLocation.top}
                      style={{ marginBottom: "1rem" }}
                    />
                    <Flex justifyContent={{ default: "justifyContentSpaceBetween" }}>
                      <FlexItem>
                        <strong>Free:</strong> {formatBytes(pool.free)}
                      </FlexItem>
                      <FlexItem>
                        <strong>Frag:</strong> {pool.frag}%
                      </FlexItem>
                      <FlexItem>
                        <strong>Dedup:</strong> {pool.dedup}x
                      </FlexItem>
                    </Flex>
                    {pool.scan && pool.scan.function !== "none" && (
                      <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "gray" }}>
                        <strong>{pool.scan.function === "scrub" ? "Scrub" : "Resilver"}:</strong>{" "}
                        {pool.scan.state === "in_progress" ? `In progress (${pool.scan.percentage}%)` : "Completed"}
                      </div>
                    )}
                  </CardBody>
                  <Divider />
                  <CardFooter>
                    <Button variant="link" isInline onClick={() => onSelectPool(pool.name)}>
                      Manage Pool &rarr;
                    </Button>
                  </CardFooter>
                </Card>
              </GalleryItem>
            );
          })}
        </Gallery>
      </PageSection>
    </>
  );
};
