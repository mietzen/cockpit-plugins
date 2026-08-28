import React from "react";
import {
  Card,
  CardTitle,
  CardBody,
  Button,
  Flex,
  FlexItem,
  Progress,
  ProgressMeasureLocation,
  Title,
  Alert,
} from "@patternfly/react-core";
import { PlayIcon, PauseIcon, StopIcon, SyncAltIcon } from "@patternfly/react-icons";
import { ZPool } from "../types";

interface MaintenanceTabProps {
  pool: ZPool;
  onScrubAction: (poolName: string, action: "start" | "pause" | "stop") => void;
  onTrimAction: (poolName: string, action: "start" | "suspend" | "stop") => void;
}

export const MaintenanceTab: React.FC<MaintenanceTabProps> = ({
  pool,
  onScrubAction,
  onTrimAction,
}) => {
  const isScrubbing = pool.scan?.function === "scrub" && pool.scan?.state === "in_progress";
  const isResilvering = pool.scan?.function === "resilver" && pool.scan?.state === "in_progress";

  return (
    <div>
      <Title headingLevel="h2" size="xl" style={{ marginBottom: "1rem" }}>
        Pool Maintenance (Scrub &amp; Trim)
      </Title>

      {/* Scrub Section */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <CardTitle>
          <Flex alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>
              <SyncAltIcon style={{ marginRight: "0.5rem" }} />
            </FlexItem>
            <FlexItem>Data Integrity Check (Scrub)</FlexItem>
          </Flex>
        </CardTitle>
        <CardBody>
          <p style={{ marginBottom: "1rem" }}>
            A ZFS scrub reads all data blocks across the pool, verifies checksums, and automatically
            repairs detected bit-rot from redundant mirror/RAID-Z copies.
          </p>

          {isScrubbing && (
            <div style={{ marginBottom: "1.5rem" }}>
              <Progress
                value={pool.scan?.percentage || 0}
                title={`Scrubbing in progress (${pool.scan?.percentage || 0}%)`}
                measureLocation={ProgressMeasureLocation.top}
              />
            </div>
          )}

          {pool.scan?.raw && !isScrubbing && (
            <Alert variant="info" isInline title="Last Scan Info" style={{ marginBottom: "1.5rem" }}>
              {pool.scan.raw}
            </Alert>
          )}

          <Flex>
            <FlexItem>
              <Button
                variant={isScrubbing ? "secondary" : "primary"}
                icon={<PlayIcon />}
                onClick={() => onScrubAction(pool.name, "start")}
                isDisabled={isScrubbing || isResilvering}
              >
                Start Scrub
              </Button>
            </FlexItem>
            {isScrubbing && (
              <>
                <FlexItem>
                  <Button
                    variant="secondary"
                    icon={<PauseIcon />}
                    onClick={() => onScrubAction(pool.name, "pause")}
                  >
                    Pause Scrub
                  </Button>
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="danger"
                    icon={<StopIcon />}
                    onClick={() => onScrubAction(pool.name, "stop")}
                  >
                    Stop Scrub
                  </Button>
                </FlexItem>
              </>
            )}
          </Flex>
        </CardBody>
      </Card>

      {/* Trim Section */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <CardTitle>
          <Flex alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>
              <SyncAltIcon style={{ marginRight: "0.5rem" }} />
            </FlexItem>
            <FlexItem>SSD Space Reclamation (Trim)</FlexItem>
          </Flex>
        </CardTitle>
        <CardBody>
          <p style={{ marginBottom: "1rem" }}>
            Trimming notifies SSD devices about unallocated LBA sectors so the flash controller can
            perform wear leveling and garbage collection efficiently.
          </p>

          <Flex>
            <FlexItem>
              <Button
                variant="primary"
                icon={<PlayIcon />}
                onClick={() => onTrimAction(pool.name, "start")}
              >
                Start Pool Trim
              </Button>
            </FlexItem>
            <FlexItem>
              <Button
                variant="secondary"
                icon={<PauseIcon />}
                onClick={() => onTrimAction(pool.name, "suspend")}
              >
                Suspend Trim
              </Button>
            </FlexItem>
            <FlexItem>
              <Button
                variant="danger"
                icon={<StopIcon />}
                onClick={() => onTrimAction(pool.name, "stop")}
              >
                Stop Trim
              </Button>
            </FlexItem>
          </Flex>
        </CardBody>
      </Card>
    </div>
  );
};
