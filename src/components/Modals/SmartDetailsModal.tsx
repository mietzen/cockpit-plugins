import React from "react";
import {
  Modal,
  ModalVariant,
  Button,
  Label,
  Title,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { DiskDevice } from "../../types";
import { formatBytes } from "../../utils/formatters";

interface SmartDetailsModalProps {
  isOpen: boolean;
  disk: DiskDevice | null;
  onClose: () => void;
}

export const SmartDetailsModal: React.FC<SmartDetailsModalProps> = ({
  isOpen,
  disk,
  onClose,
}) => {
  if (!isOpen || !disk) {
    return null;
  }

  const isSmartPassed = disk.smart_health === "PASSED";

  return (
    <Modal
      variant={ModalVariant.medium}
      title={`SMART Details: ${disk.name}`}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="close" variant="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <DescriptionList isHorizontal style={{ marginBottom: "1.5rem" }}>
        <DescriptionListGroup>
          <DescriptionListTerm>Device path</DescriptionListTerm>
          <DescriptionListDescription>{disk.path}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Model</DescriptionListTerm>
          <DescriptionListDescription>{disk.model || "-"}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Serial number</DescriptionListTerm>
          <DescriptionListDescription>{disk.serial || "-"}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>WWN</DescriptionListTerm>
          <DescriptionListDescription>{disk.wwn || "-"}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>SMART overall health</DescriptionListTerm>
          <DescriptionListDescription>
            <Label color={isSmartPassed ? "green" : "red"}>
              {disk.smart_health || "UNKNOWN"}
            </Label>
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Temperature</DescriptionListTerm>
          <DescriptionListDescription>
            {disk.temperature !== null && disk.temperature !== undefined ? `${disk.temperature} °C` : "-"}
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      <Title headingLevel="h4" size="md" style={{ marginBottom: "0.5rem", fontWeight: 600 }}>
        Partitions &amp; Filesystem Signatures
      </Title>
      {disk.partitions && disk.partitions.length > 0 ? (
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
            {disk.partitions.map((p) => (
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
        <p style={{ color: "#a0a0a0" }}>No partitions found on this device.</p>
      )}
    </Modal>
  );
};
