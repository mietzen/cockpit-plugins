import React, { useState } from "react";
import {
  PageSection,
  Title,
  Label,
  Flex,
  FlexItem,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  SearchInput,
  Button,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { HddIcon, EllipsisVIcon, CheckCircleIcon, ExclamationCircleIcon } from "@patternfly/react-icons";
import { DiskDevice } from "../types";
import { formatBytes } from "../utils/formatters";
import { SmartDetailsModal } from "./Modals/SmartDetailsModal";

interface DisksViewProps {
  disks: DiskDevice[];
  onWipeDisk: (disk: DiskDevice) => void;
  onRunSmartTest: (disk: DiskDevice, testType: "short" | "long") => void;
  onViewSmartDetails?: (disk: DiskDevice) => void;
}

export const DisksView: React.FC<DisksViewProps> = ({
  disks,
  onWipeDisk,
  onRunSmartTest,
  onViewSmartDetails,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [selectedDiskForSmart, setSelectedDiskForSmart] = useState<DiskDevice | null>(null);
  const [searchValue, setSearchValue] = useState("");

  const toggleDropdown = (diskName: string) => {
    setOpenDropdown(openDropdown === diskName ? null : diskName);
  };

  const handleShowSmart = (disk: DiskDevice) => {
    if (onViewSmartDetails) {
      onViewSmartDetails(disk);
    } else {
      setSelectedDiskForSmart(disk);
    }
  };

  const filteredDisks = disks.filter(
    (d) =>
      d.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      d.path.toLowerCase().includes(searchValue.toLowerCase()) ||
      d.model.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600 }}>
              Disks &amp; S.M.A.R.T.
            </Title>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        <div style={{ maxWidth: "350px", marginBottom: "1rem" }}>
          <SearchInput
            placeholder="Filter disks by name or model..."
            value={searchValue}
            onChange={(_event, value) => setSearchValue(value)}
            onClear={() => setSearchValue("")}
          />
        </div>

        <Table aria-label="Disks Table" variant="compact">
          <Thead>
            <Tr>
              <Th>Device</Th>
              <Th>Model / Serial</Th>
              <Th>Size</Th>
              <Th>Type</Th>
              <Th>Transport</Th>
              <Th>SMART status</Th>
              <Th>Temperature</Th>
              <Th>Pool assignment</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {filteredDisks.map((disk) => {
              const isSmartPassed = disk.smart_health === "PASSED";
              const isSmartFailed = disk.smart_health === "FAILED";

              return (
                <Tr key={disk.name}>
                  <Td dataLabel="Device">
                    <Button
                      variant="link"
                      isInline
                      onClick={() => handleShowSmart(disk)}
                      style={{ textAlign: "left" }}
                    >
                      <Flex alignItems={{ default: "alignItemsCenter" }}>
                        <FlexItem>
                          <HddIcon style={{ color: "rgb(146, 197, 249)" }} />
                        </FlexItem>
                        <FlexItem>
                          <strong>{disk.name}</strong>
                          <div style={{ fontSize: "0.8rem", color: "#999999" }}>{disk.path}</div>
                        </FlexItem>
                      </Flex>
                    </Button>
                  </Td>
                  <Td dataLabel="Model / Serial">
                    <div>{disk.model || "-"}</div>
                    <div style={{ fontSize: "0.8rem", color: "#999999" }}>{disk.serial || "-"}</div>
                  </Td>
                  <Td dataLabel="Size">{formatBytes(disk.size)}</Td>
                  <Td dataLabel="Type">
                    <Label color="grey">{disk.rotational ? "HDD" : "SSD / NVMe"}</Label>
                  </Td>
                  <Td dataLabel="Transport">
                    {disk.transport ? disk.transport.toUpperCase() : "-"}
                  </Td>
                  <Td dataLabel="SMART status">
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
                        <span style={{ marginLeft: "0.25rem" }}>{disk.smart_health}</span>
                      </FlexItem>
                    </Flex>
                  </Td>
                  <Td dataLabel="Temperature">
                    {disk.temperature !== null && disk.temperature !== undefined
                      ? `${disk.temperature} °C`
                      : "-"}
                  </Td>
                  <Td dataLabel="Pool assignment">
                    {disk.pool ? (
                      <Label color="blue">{disk.pool}</Label>
                    ) : (
                      <span style={{ color: "#999999" }}>Unallocated</span>
                    )}
                  </Td>
                  <Td isActionCell>
                    <Dropdown
                      popperProps={{ position: "right", preventOverflow: true, appendTo: () => document.body }}
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
                        <DropdownItem key="smart-view" onClick={() => handleShowSmart(disk)}>
                          View SMART details
                        </DropdownItem>
                        <DropdownItem key="smart-short" onClick={() => onRunSmartTest(disk, "short")}>
                          Run short self-test
                        </DropdownItem>
                        <DropdownItem key="smart-long" onClick={() => onRunSmartTest(disk, "long")}>
                          Run extended self-test
                        </DropdownItem>
                        {!disk.pool && (
                          <DropdownItem key="wipe" style={{ color: "red" }} onClick={() => onWipeDisk(disk)}>
                            Wipe disk signatures
                          </DropdownItem>
                        )}
                      </DropdownList>
                    </Dropdown>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </PageSection>

      <SmartDetailsModal
        isOpen={!!selectedDiskForSmart}
        disk={selectedDiskForSmart}
        onClose={() => setSelectedDiskForSmart(null)}
      />
    </>
  );
};
