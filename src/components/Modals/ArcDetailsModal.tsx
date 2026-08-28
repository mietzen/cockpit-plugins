import React from "react";
import {
  Modal,
  ModalVariant,
  Button,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Progress,
  ProgressMeasureLocation,
  Title,
  Divider,
} from "@patternfly/react-core";
import { ArcStats } from "../../types";
import { formatBytes, formatPercentage } from "../../utils/formatters";

interface ArcDetailsModalProps {
  isOpen: boolean;
  arcStats: ArcStats | null | undefined;
  onClose: () => void;
}

export const ArcDetailsModal: React.FC<ArcDetailsModalProps> = ({
  isOpen,
  arcStats,
  onClose,
}) => {
  if (!isOpen || !arcStats) {
    return null;
  }

  const arcSize = arcStats.size || 0;
  const targetSize = arcStats.target_size || arcStats.max_size || arcSize || 1;
  const arcUsagePct = Math.min(100, Math.round((arcSize / targetSize) * 100));

  const totalHits = arcStats.hits || 0;
  const totalMisses = arcStats.misses || 0;
  const totalRequests = totalHits + totalMisses;
  const hitRatioPct = (arcStats.hit_ratio || 0) * 100;

  return (
    <Modal
      variant={ModalVariant.medium}
      title="OpenZFS ARC (Adaptive Replacement Cache) Details"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <Title headingLevel="h4" size="md" style={{ marginBottom: "0.5rem", fontWeight: 600 }}>
          ARC Memory Allocation
        </Title>
        <Progress
          value={arcUsagePct}
          title={`Current size: ${formatBytes(arcSize)} (Target: ${formatBytes(arcStats.target_size || 0)})`}
          measureLocation={ProgressMeasureLocation.top}
        />
      </div>

      <DescriptionList isHorizontal isCompact style={{ marginBottom: "1.5rem" }}>
        <DescriptionListGroup>
          <DescriptionListTerm>Current ARC Size</DescriptionListTerm>
          <DescriptionListDescription>{formatBytes(arcStats.size)}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Target Size (c)</DescriptionListTerm>
          <DescriptionListDescription>{formatBytes(arcStats.target_size)}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Minimum Target (c_min)</DescriptionListTerm>
          <DescriptionListDescription>{formatBytes(arcStats.min_size)}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Maximum Target (c_max)</DescriptionListTerm>
          <DescriptionListDescription>{formatBytes(arcStats.max_size)}</DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      <Divider style={{ marginBottom: "1.5rem" }} />

      <Title headingLevel="h4" size="md" style={{ marginBottom: "1rem", fontWeight: 600 }}>
        Cache Efficiency &amp; Hit Rates
      </Title>

      <DescriptionList isHorizontal isCompact>
        <DescriptionListGroup>
          <DescriptionListTerm>Total Hit Rate</DescriptionListTerm>
          <DescriptionListDescription>
            <strong style={{ color: "rgb(146, 197, 249)" }}>{formatPercentage(hitRatioPct)}</strong>
            <span style={{ color: "#a0a0a0", marginLeft: "0.5rem" }}>
              ({totalHits.toLocaleString()} hits / {totalRequests.toLocaleString()} requests)
            </span>
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Demand Data Hits / Misses</DescriptionListTerm>
          <DescriptionListDescription>
            {(arcStats.data_hits || 0).toLocaleString()} hits / {(arcStats.data_misses || 0).toLocaleString()} misses
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Demand Metadata Hits / Misses</DescriptionListTerm>
          <DescriptionListDescription>
            {(arcStats.metadata_hits || 0).toLocaleString()} hits / {(arcStats.metadata_misses || 0).toLocaleString()} misses
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
    </Modal>
  );
};
