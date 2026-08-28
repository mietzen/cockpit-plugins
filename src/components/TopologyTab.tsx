import React, { useState } from "react";
import {
  Card,
  CardTitle,
  CardBody,
  Label,
  Button,
  Flex,
  FlexItem,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Title,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import {
  ServerIcon,
  HddIcon,
  EllipsisVIcon,
  SyncAltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@patternfly/react-icons";
import { ZPool, VDevItem } from "../types";

interface TopologyTabProps {
  pool: ZPool;
  onAttachDisk: (poolName: string, existingDevice: string) => void;
  onDetachDisk: (poolName: string, device: string) => void;
  onOfflineDisk: (poolName: string, device: string) => void;
  onOnlineDisk: (poolName: string, device: string) => void;
  onReplaceDisk: (poolName: string, device: string) => void;
  onClearErrors: (poolName: string, device?: string) => void;
  onTrimDisk: (poolName: string, device: string) => void;
}

export const TopologyTab: React.FC<TopologyTabProps> = ({
  pool,
  onAttachDisk,
  onDetachDisk,
  onOfflineDisk,
  onOnlineDisk,
  onReplaceDisk,
  onClearErrors,
  onTrimDisk,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (devName: string) => {
    setOpenDropdown(openDropdown === devName ? null : devName);
  };

  const renderVDevTable = (title: string, vdevList?: VDevItem[], isData = false) => {
    if (!vdevList || vdevList.length === 0) {
      return null;
    }

    return (
      <Card isPlain style={{ border: "1px solid var(--pf-v5-global--BorderColor--100)", marginBottom: "1.5rem" }}>
        <CardTitle>
          <Flex alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>
              <ServerIcon style={{ marginRight: "0.5rem" }} />
            </FlexItem>
            <FlexItem>
              <Title headingLevel="h3" size="lg" style={{ fontWeight: 600 }}>
                {title} ({vdevList.length})
              </Title>
            </FlexItem>
          </Flex>
        </CardTitle>
        <CardBody>
          <Table aria-label={`${title} Table`} variant="compact">
            <Thead>
              <Tr>
                <Th>Device / Group</Th>
                <Th>Status</Th>
                <Th>Read errors</Th>
                <Th>Write errors</Th>
                <Th>Checksum errors</Th>
                <Th aria-label="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {vdevList.map((vdev) => {
                const rows = [];
                const isOnline = vdev.state === "ONLINE";

                // Parent group row
                rows.push(
                  <Tr key={vdev.name} style={{ backgroundColor: vdev.is_group ? "var(--pf-v5-global--BackgroundColor--200)" : undefined }}>
                    <Td dataLabel="Device / Group">
                      <Flex alignItems={{ default: "alignItemsCenter" }}>
                        <FlexItem>
                          {vdev.is_group ? <ServerIcon /> : <HddIcon />}
                        </FlexItem>
                        <FlexItem>
                          <strong>{vdev.name}</strong>
                        </FlexItem>
                      </Flex>
                    </Td>
                    <Td dataLabel="Status">
                      <Flex alignItems={{ default: "alignItemsCenter" }}>
                        <FlexItem>
                          {isOnline ? (
                            <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)" }} />
                          ) : (
                            <ExclamationTriangleIcon style={{ color: "var(--pf-v5-global--warning-color--100)" }} />
                          )}
                        </FlexItem>
                        <FlexItem>
                          <span style={{ marginLeft: "0.25rem" }}>{vdev.state}</span>
                        </FlexItem>
                      </Flex>
                    </Td>
                    <Td dataLabel="Read errors">{vdev.read}</Td>
                    <Td dataLabel="Write errors">{vdev.write}</Td>
                    <Td dataLabel="Checksum errors">{vdev.cksum}</Td>
                    <Td isActionCell>
                      {!vdev.is_group && (
                        <Dropdown
                          isOpen={openDropdown === vdev.name}
                          onSelect={() => setOpenDropdown(null)}
                          onOpenChange={(isOpen) => setOpenDropdown(isOpen ? vdev.name : null)}
                          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                            <MenuToggle
                              ref={toggleRef}
                              aria-label="Device actions"
                              variant="plain"
                              onClick={() => toggleDropdown(vdev.name)}
                              isExpanded={openDropdown === vdev.name}
                            >
                              <EllipsisVIcon />
                            </MenuToggle>
                          )}
                        >
                          <DropdownList>
                            {isData && (
                              <DropdownItem key="attach" onClick={() => onAttachDisk(pool.name, vdev.name)}>
                                Attach mirror device
                              </DropdownItem>
                            )}
                            <DropdownItem key="replace" onClick={() => onReplaceDisk(pool.name, vdev.name)}>
                              Replace device
                            </DropdownItem>
                            {vdev.state === "ONLINE" ? (
                              <DropdownItem key="offline" onClick={() => onOfflineDisk(pool.name, vdev.name)}>
                                Offline device
                              </DropdownItem>
                            ) : (
                              <DropdownItem key="online" onClick={() => onOnlineDisk(pool.name, vdev.name)}>
                                Online device
                              </DropdownItem>
                            )}
                            <DropdownItem key="trim" onClick={() => onTrimDisk(pool.name, vdev.name)}>
                              Trim device
                            </DropdownItem>
                            <DropdownItem key="detach" onClick={() => onDetachDisk(pool.name, vdev.name)}>
                              Detach device
                            </DropdownItem>
                          </DropdownList>
                        </Dropdown>
                      )}
                    </Td>
                  </Tr>
                );

                // Children rows
                if (vdev.children) {
                  vdev.children.forEach((child) => {
                    const childOnline = child.state === "ONLINE";
                    rows.push(
                      <Tr key={child.name}>
                        <Td dataLabel="Device / Group" style={{ paddingLeft: "2.5rem" }}>
                          <Flex alignItems={{ default: "alignItemsCenter" }}>
                            <FlexItem>
                              <HddIcon />
                            </FlexItem>
                            <FlexItem>{child.name}</FlexItem>
                          </Flex>
                        </Td>
                        <Td dataLabel="Status">
                          <Flex alignItems={{ default: "alignItemsCenter" }}>
                            <FlexItem>
                              {childOnline ? (
                                <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)" }} />
                              ) : (
                                <ExclamationTriangleIcon style={{ color: "var(--pf-v5-global--warning-color--100)" }} />
                              )}
                            </FlexItem>
                            <FlexItem>
                              <span style={{ marginLeft: "0.25rem" }}>{child.state}</span>
                            </FlexItem>
                          </Flex>
                        </Td>
                        <Td dataLabel="Read errors">{child.read}</Td>
                        <Td dataLabel="Write errors">{child.write}</Td>
                        <Td dataLabel="Checksum errors">{child.cksum}</Td>
                        <Td isActionCell>
                          <Dropdown
                            isOpen={openDropdown === child.name}
                            onSelect={() => setOpenDropdown(null)}
                            onOpenChange={(isOpen) => setOpenDropdown(isOpen ? child.name : null)}
                            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                              <MenuToggle
                                ref={toggleRef}
                                aria-label="Device actions"
                                variant="plain"
                                onClick={() => toggleDropdown(child.name)}
                                isExpanded={openDropdown === child.name}
                              >
                                <EllipsisVIcon />
                              </MenuToggle>
                            )}
                          >
                            <DropdownList>
                              {isData && (
                                <DropdownItem key="attach" onClick={() => onAttachDisk(pool.name, child.name)}>
                                  Attach mirror device
                                </DropdownItem>
                              )}
                              <DropdownItem key="replace" onClick={() => onReplaceDisk(pool.name, child.name)}>
                                Replace device
                              </DropdownItem>
                              {child.state === "ONLINE" ? (
                                <DropdownItem key="offline" onClick={() => onOfflineDisk(pool.name, child.name)}>
                                  Offline device
                                </DropdownItem>
                              ) : (
                                <DropdownItem key="online" onClick={() => onOnlineDisk(pool.name, child.name)}>
                                  Online device
                                </DropdownItem>
                              )}
                              <DropdownItem key="trim" onClick={() => onTrimDisk(pool.name, child.name)}>
                                Trim device
                              </DropdownItem>
                              <DropdownItem key="detach" onClick={() => onDetachDisk(pool.name, child.name)}>
                                Detach device
                              </DropdownItem>
                            </DropdownList>
                          </Dropdown>
                        </Td>
                      </Tr>
                    );
                  });
                }

                return rows;
              })}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
    );
  };

  return (
    <div>
      <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} style={{ marginBottom: "1.5rem" }}>
        <FlexItem>
          <Title headingLevel="h2" size="xl" style={{ fontWeight: 600 }}>
            Topology &amp; Devices
          </Title>
        </FlexItem>
        <FlexItem>
          <Button variant="secondary" icon={<SyncAltIcon />} onClick={() => onClearErrors(pool.name)}>
            Clear pool errors
          </Button>
        </FlexItem>
      </Flex>

      {renderVDevTable("Data VDevs", pool.vdevs, true)}
      {renderVDevTable("Special / Metadata VDevs", pool.special)}
      {renderVDevTable("Dedup VDevs", pool.dedup_vdevs)}
      {renderVDevTable("Cache devices (L2ARC)", pool.cache)}
      {renderVDevTable("Log devices (SLOG)", pool.logs)}
      {renderVDevTable("Spare devices", pool.spares)}
    </div>
  );
};
