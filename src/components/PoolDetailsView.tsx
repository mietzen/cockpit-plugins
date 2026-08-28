import React, { useState } from "react";
import {
  PageSection,
  Title,
  Breadcrumb,
  BreadcrumbItem,
  Tabs,
  Tab,
  TabTitleText,
  Badge,
  Flex,
  FlexItem,
  Button,
} from "@patternfly/react-core";
import { ArrowLeftIcon } from "@patternfly/react-icons";
import { ZPool, ZDataset, ZSnapshot } from "../types";
import { formatBytes, getHealthBadgeColor } from "../utils/formatters";
import { TopologyTab } from "./TopologyTab";
import { DatasetsTab } from "./DatasetsTab";
import { SnapshotsTab } from "./SnapshotsTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { PoolSettingsTab } from "./PoolSettingsTab";

interface PoolDetailsViewProps {
  pool: ZPool;
  datasets: ZDataset[];
  snapshots: ZSnapshot[];
  initialTab?: string;
  onBack: () => void;
  onAttachDisk: (poolName: string, existingDevice: string) => void;
  onDetachDisk: (poolName: string, device: string) => void;
  onOfflineDisk: (poolName: string, device: string) => void;
  onOnlineDisk: (poolName: string, device: string) => void;
  onReplaceDisk: (poolName: string, device: string) => void;
  onClearErrors: (poolName: string, device?: string) => void;
  onTrimDisk: (poolName: string, device: string) => void;
  onCreateDataset: (parentDataset?: string) => void;
  onCreateZVol: (parentDataset?: string) => void;
  onEditProperties: (dataset: ZDataset) => void;
  onCreateSnapshot: (dataset?: ZDataset) => void;
  onMountToggle: (dataset: ZDataset) => void;
  onRenameDataset: (dataset: ZDataset) => void;
  onDestroyDataset: (dataset: ZDataset) => void;
  onRollbackSnapshot: (snapshot: ZSnapshot) => void;
  onCloneSnapshot: (snapshot: ZSnapshot) => void;
  onRenameSnapshot: (snapshot: ZSnapshot) => void;
  onDestroySnapshot: (snapshot: ZSnapshot) => void;
  onBulkDestroySnapshots: (snapshots: ZSnapshot[]) => void;
  onScrubAction: (poolName: string, action: "start" | "pause" | "stop") => void;
  onTrimAction: (poolName: string, action: "start" | "suspend" | "stop") => void;
  onSaveProperties: (poolName: string, properties: Record<string, string>) => void;
}

export const PoolDetailsView: React.FC<PoolDetailsViewProps> = ({
  pool,
  datasets,
  snapshots,
  initialTab = "topology",
  onBack,
  onAttachDisk,
  onDetachDisk,
  onOfflineDisk,
  onOnlineDisk,
  onReplaceDisk,
  onClearErrors,
  onTrimDisk,
  onCreateDataset,
  onCreateZVol,
  onEditProperties,
  onCreateSnapshot,
  onMountToggle,
  onRenameDataset,
  onDestroyDataset,
  onRollbackSnapshot,
  onCloneSnapshot,
  onRenameSnapshot,
  onDestroySnapshot,
  onBulkDestroySnapshots,
  onScrubAction,
  onTrimAction,
  onSaveProperties,
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  return (
    <>
      <PageSection variant="light">
        <Breadcrumb style={{ marginBottom: "0.5rem" }}>
          <BreadcrumbItem>
            <Button variant="link" isInline icon={<ArrowLeftIcon />} onClick={onBack}>
              Pools
            </Button>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{pool.name}</BreadcrumbItem>
        </Breadcrumb>

        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }}>
              <FlexItem>
                <Title headingLevel="h1" size="2xl">
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
          </FlexItem>
          <FlexItem>
            <span style={{ marginRight: "1rem" }}>
              <strong>Allocated:</strong> {formatBytes(pool.alloc)} / {formatBytes(pool.size)}
            </span>
            <span>
              <strong>Free:</strong> {formatBytes(pool.free)}
            </span>
          </FlexItem>
        </Flex>

        <Tabs
          activeKey={activeTab}
          onSelect={(_event, tabKey) => setActiveTab(String(tabKey))}
          style={{ marginTop: "1rem" }}
        >
          <Tab eventKey="topology" title={<TabTitleText>Topology</TabTitleText>} />
          <Tab eventKey="datasets" title={<TabTitleText>Datasets &amp; ZVols</TabTitleText>} />
          <Tab eventKey="snapshots" title={<TabTitleText>Snapshots</TabTitleText>} />
          <Tab eventKey="maintenance" title={<TabTitleText>Maintenance</TabTitleText>} />
          <Tab eventKey="settings" title={<TabTitleText>Settings</TabTitleText>} />
        </Tabs>
      </PageSection>

      <PageSection>
        {activeTab === "topology" && (
          <TopologyTab
            pool={pool}
            onAttachDisk={onAttachDisk}
            onDetachDisk={onDetachDisk}
            onOfflineDisk={onOfflineDisk}
            onOnlineDisk={onOnlineDisk}
            onReplaceDisk={onReplaceDisk}
            onClearErrors={onClearErrors}
            onTrimDisk={onTrimDisk}
          />
        )}
        {activeTab === "datasets" && (
          <DatasetsTab
            poolName={pool.name}
            datasets={datasets}
            onCreateDataset={onCreateDataset}
            onCreateZVol={onCreateZVol}
            onEditProperties={onEditProperties}
            onCreateSnapshot={onCreateSnapshot}
            onMountToggle={onMountToggle}
            onRenameDataset={onRenameDataset}
            onDestroyDataset={onDestroyDataset}
          />
        )}
        {activeTab === "snapshots" && (
          <SnapshotsTab
            poolName={pool.name}
            snapshots={snapshots}
            onCreateSnapshot={() => onCreateSnapshot()}
            onRollbackSnapshot={onRollbackSnapshot}
            onCloneSnapshot={onCloneSnapshot}
            onRenameSnapshot={onRenameSnapshot}
            onDestroySnapshot={onDestroySnapshot}
            onBulkDestroySnapshots={onBulkDestroySnapshots}
          />
        )}
        {activeTab === "maintenance" && (
          <MaintenanceTab
            pool={pool}
            onScrubAction={onScrubAction}
            onTrimAction={onTrimAction}
          />
        )}
        {activeTab === "settings" && (
          <PoolSettingsTab
            pool={pool}
            onSaveProperties={onSaveProperties}
          />
        )}
      </PageSection>
    </>
  );
};
