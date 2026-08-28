import React, { useState } from "react";
import {
  PageSection,
  Title,
  Badge,
  Button,
  Flex,
  FlexItem,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalVariant,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { HddIcon, EllipsisVIcon, ShieldAltIcon } from "@patternfly/react-icons";
import { DiskDevice } from "../types";
import { formatBytes, getHealthBadgeColor } from "../utils/formatters";

interface DisksViewProps {
  disks: DiskDevice[];
  onWipeDisk: (disk: DiskDevice) => void;
  onRunSmartTest: (disk: DiskDevice, testType: "short" | "long") => void;
}

export const DisksView: React.FC<DisksViewProps> = ({
  disks,
  onWipeDisk,
  onRunSmartTest,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedDiskForSmart, setSelectedDiskForSmart] = useState<DiskDevice | null>(null);

  const toggleDropdown = (diskName: string) => {
    setOpenDropdown(openDropdown === diskName ? null : diskName);
  };

  return (
    <>
      <PageSection variant="light">
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              Host Disks &amp; S.M.A.R.T.
            </Title>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection>
        <Table aria-label="Disks Table" variant="compact">
          <Thead>
            <Tr>
              <Th>Device</Th>
              <Th>Model / Serial</Th>
              <Th>Size</Th>
              <Th>Type</Th>
              <Th>Transport</Th>
              <Th>SMART Health</Th>
              <Th>Temp</Th>
              <Th>Pool Assignment</Th>
              <Th aria-label="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {disks.map((disk) => (
              <Tr key={disk.name}>
                <Td dataLabel="Device">
                  <Flex alignItems={{ default: "alignItemsCenter" }}>
                    <FlexItem>
                      <HddIcon style={{ color: "var(--pf-v5-global--primary-color--100)" }} />
                    </FlexItem>
                    <FlexItem>
                      <strong>{disk.name}</strong>
                      <div style={{ fontSize: "0.8rem", color: "gray" }}>{disk.path}</div>
                    </FlexItem>
                  </Flex>
                </Td>
                <Td dataLabel="Model / Serial">
                  <div>{disk.model || "-"}</div>
                  <div style={{ fontSize: "0.8rem", color: "gray" }}>{disk.serial || "-"}</div>
                </Td>
                <Td dataLabel="Size">{formatBytes(disk.size)}</Td>
                <Td dataLabel="Type">
                  <Badge isRead>{disk.rotational ? "HDD" : "SSD / NVMe"}</Badge>
                </Td>
                <Td dataLabel="Transport">
                  {disk.transport ? disk.transport.toUpperCase() : "-"}
                </Td>
                <Td dataLabel="SMART Health">
                  <Badge
                    style={{
                      backgroundColor:
                        getHealthBadgeColor(disk.smart_health) === "success"
                          ? "var(--pf-v5-global--success-color--100)"
                          : getHealthBadgeColor(disk.smart_health) === "danger"
                          ? "var(--pf-v5-global--danger-color--100)"
                          : "gray",
                      color: "white",
                    }}
                  >
                    {disk.smart_health}
                  </Badge>
                </Td>
                <Td dataLabel="Temp">
                  {disk.temperature !== null && disk.temperature !== undefined
                    ? `${disk.temperature} °C`
                    : "-"}
                </Td>
                <Td dataLabel="Pool Assignment">
                  {disk.pool ? (
                    <Badge isRead>{disk.pool}</Badge>
                  ) : (
                    <span style={{ color: "gray" }}>Unallocated</span>
                  )}
                </Td>
                <Td isActionCell>
                  <Dropdown
                    isOpen={openDropdown === disk.name}
                    onSelect={() => setOpenDropdown(null)}
                    onOpenChange={(isOpen) => setOpenDropdown(isOpen ? disk.name : null)}
                    toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                      <MenuToggle
                        ref={toggleRef}
                        aria-label="Disk actions"
                        variant="plain"
                        onClick={() => toggleDropdown(disk.name)}
                        isExpanded={openDropdown === disk.name}
                      >
                        <EllipsisVIcon />
                      </MenuToggle>
                    )}
                  >
                    <DropdownList>
                      <DropdownItem key="smart-view" onClick={() => setSelectedDiskForSmart(disk)}>
                        View SMART Details
                      </DropdownItem>
                      <DropdownItem key="smart-short" onClick={() => onRunSmartTest(disk, "short")}>
                        Run Short Self-Test
                      </DropdownItem>
                      <DropdownItem key="smart-long" onClick={() => onRunSmartTest(disk, "long")}>
                        Run Extended Self-Test
                      </DropdownItem>
                      {!disk.pool && (
                        <DropdownItem key="wipe" style={{ color: "red" }} onClick={() => onWipeDisk(disk)}>
                          Wipe Disk Signatures
                        </DropdownItem>
                      )}
                    </DropdownList>
                  </Dropdown>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </PageSection>

      {/* SMART Details Modal */}
      {selectedDiskForSmart && (
        <Modal
          variant={ModalVariant.medium}
          title={`SMART Details: ${selectedDiskForSmart.name} (${selectedDiskForSmart.model})`}
          isOpen={true}
          onClose={() => setSelectedDiskForSmart(null)}
          actions={[
            <Button key="close" variant="primary" onClick={() => setSelectedDiskForSmart(null)}>
              Close
            </Button>,
          ]}
        >
          <div style={{ marginBottom: "1rem" }}>
            <p>
              <strong>Device Path:</strong> {selectedDiskForSmart.path}
            </p>
            <p>
              <strong>Serial Number:</strong> {selectedDiskForSmart.serial || "N/A"}
            </p>
            <p>
              <strong>WWN:</strong> {selectedDiskForSmart.wwn || "N/A"}
            </p>
            <p>
              <strong>Overall Health Assessment:</strong>{" "}
              <Badge
                style={{
                  backgroundColor:
                    getHealthBadgeColor(selectedDiskForSmart.smart_health) === "success"
                      ? "var(--pf-v5-global--success-color--100)"
                      : "var(--pf-v5-global--danger-color--100)",
                  color: "white",
                }}
              >
                {selectedDiskForSmart.smart_health}
              </Badge>
            </p>
            <p>
              <strong>Current Temperature:</strong>{" "}
              {selectedDiskForSmart.temperature !== null ? `${selectedDiskForSmart.temperature} °C` : "N/A"}
            </p>
          </div>

          <Title headingLevel="h4" size="md" style={{ marginBottom: "0.5rem" }}>
            Partitions &amp; Filesystem Signatures
          </Title>
          {selectedDiskForSmart.partitions && selectedDiskForSmart.partitions.length > 0 ? (
            <Table variant="compact">
              <Thead>
                <Tr>
                  <Th>Partition</Th>
                  <Th>Size</Th>
                  <Th>FSType</Th>
                  <Th>Mountpoint</Th>
                </Tr>
              </Thead>
              <Tbody>
                {selectedDiskForSmart.partitions.map((p) => (
                  <Tr key={p.name}>
                    <Td>{p.name}</Td>
                    <Td>{formatBytes(p.size)}</Td>
                    <Td>{p.fstype || "-"}</Td>
                    <Td>{p.mountpoint || "-"}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <p style={{ color: "gray" }}>No partitions found on this device.</p>
          )}
        </Modal>
      )}
    </>
  );
};
