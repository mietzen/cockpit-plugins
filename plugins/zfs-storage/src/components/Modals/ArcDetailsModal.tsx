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
  Grid,
  GridItem,
  Card,
  CardBody,
  CardTitle,
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
      variant={ModalVariant.large}
      title="OpenZFS ARC Details"
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

      <Grid hasGutter style={{ marginBottom: "1.5rem" }}>
        <GridItem span={12} md={6}>
          <Card isCompact isFullHeight>
            <CardTitle>Cache Size &amp; Targets</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Current Size</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.size)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Target Size (c)</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.target_size)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Min Size (c_min)</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.min_size)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Max Size (c_max)</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.max_size)}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </GridItem>

        <GridItem span={12} md={6}>
          <Card isCompact isFullHeight>
            <CardTitle>Hit Rates &amp; Efficiency</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Hit Rate</DescriptionListTerm>
                  <DescriptionListDescription>
                    <strong style={{ color: "var(--pf-v5-global--primary-color--100)" }}>{formatPercentage(hitRatioPct)}</strong>
                    <span style={{ color: "var(--pf-v5-global--Color--200)", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                      ({totalHits.toLocaleString()} / {totalRequests.toLocaleString()})
                    </span>
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Demand Data</DescriptionListTerm>
                  <DescriptionListDescription>
                    {(arcStats.data_hits || 0).toLocaleString()} hits / {(arcStats.data_misses || 0).toLocaleString()} misses
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Demand Metadata</DescriptionListTerm>
                  <DescriptionListDescription>
                    {(arcStats.metadata_hits || 0).toLocaleString()} hits / {(arcStats.metadata_misses || 0).toLocaleString()} misses
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Prefetch Data</DescriptionListTerm>
                  <DescriptionListDescription>
                    {(arcStats.prefetch_data_hits || 0).toLocaleString()} hits / {(arcStats.prefetch_data_misses || 0).toLocaleString()} misses
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Prefetch Metadata</DescriptionListTerm>
                  <DescriptionListDescription>
                    {(arcStats.prefetch_metadata_hits || 0).toLocaleString()} hits / {(arcStats.prefetch_metadata_misses || 0).toLocaleString()} misses
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </GridItem>

        <GridItem span={12} md={6}>
          <Card isCompact isFullHeight>
            <CardTitle>MRU vs MFU Cache Breakdown</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>MRU Size</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.mru_size || 0)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>MRU Hits</DescriptionListTerm>
                  <DescriptionListDescription>{(arcStats.mru_hits || 0).toLocaleString()}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>MFU Size</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.mfu_size || 0)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>MFU Hits</DescriptionListTerm>
                  <DescriptionListDescription>{(arcStats.mfu_hits || 0).toLocaleString()}</DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </GridItem>

        <GridItem span={12} md={6}>
          <Card isCompact isFullHeight>
            <CardTitle>Data, Metadata &amp; Compression</CardTitle>
            <CardBody>
              <DescriptionList isHorizontal isCompact>
                <DescriptionListGroup>
                  <DescriptionListTerm>Data Cache Size</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.data_size || 0)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Metadata Cache Size</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(arcStats.metadata_size || 0)}</DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Uncompressed / Compressed</DescriptionListTerm>
                  <DescriptionListDescription>
                    {formatBytes(arcStats.uncompressed_size || 0)} / {formatBytes(arcStats.compressed_size || 0)}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                <DescriptionListGroup>
                  <DescriptionListTerm>Compression Ratio</DescriptionListTerm>
                  <DescriptionListDescription>
                    {arcStats.compression_ratio ? `${arcStats.compression_ratio}x` : "—"}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </CardBody>
          </Card>
        </GridItem>

        {Boolean(arcStats.l2_size || arcStats.l2_hits) && (
          <GridItem span={12}>
            <Card isCompact>
              <CardTitle>L2ARC Secondary Cache (SSD Cache)</CardTitle>
              <CardBody>
                <DescriptionList isHorizontal isCompact>
                  <DescriptionListGroup>
                    <DescriptionListTerm>L2ARC Size</DescriptionListTerm>
                    <DescriptionListDescription>{formatBytes(arcStats.l2_size || 0)}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>L2ARC Allocated Size</DescriptionListTerm>
                    <DescriptionListDescription>{formatBytes(arcStats.l2_asize || 0)}</DescriptionListDescription>
                  </DescriptionListGroup>
                  <DescriptionListGroup>
                    <DescriptionListTerm>L2ARC Hits / Misses</DescriptionListTerm>
                    <DescriptionListDescription>
                      {(arcStats.l2_hits || 0).toLocaleString()} hits / {(arcStats.l2_misses || 0).toLocaleString()} misses
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                </DescriptionList>
              </CardBody>
            </Card>
          </GridItem>
        )}
      </Grid>
    </Modal>

  );
};

