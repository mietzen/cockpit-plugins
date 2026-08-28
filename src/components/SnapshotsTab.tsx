import React, { useState } from "react";
import {
  Button,
  Flex,
  FlexItem,
  SearchInput,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Title,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import {
  CameraIcon,
  PlusCircleIcon,
  TrashIcon,
  EllipsisVIcon,
} from "@patternfly/react-icons";
import { ZSnapshot } from "../types";
import { formatBytes, formatDate } from "../utils/formatters";

interface SnapshotsTabProps {
  poolName: string;
  snapshots: ZSnapshot[];
  onCreateSnapshot: () => void;
  onRollbackSnapshot: (snapshot: ZSnapshot) => void;
  onCloneSnapshot: (snapshot: ZSnapshot) => void;
  onRenameSnapshot: (snapshot: ZSnapshot) => void;
  onDestroySnapshot: (snapshot: ZSnapshot) => void;
  onBulkDestroySnapshots: (snapshots: ZSnapshot[]) => void;
}

export const SnapshotsTab: React.FC<SnapshotsTabProps> = ({
  poolName,
  snapshots,
  onCreateSnapshot,
  onRollbackSnapshot,
  onCloneSnapshot,
  onRenameSnapshot,
  onDestroySnapshot,
  onBulkDestroySnapshots,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [selectedSnaps, setSelectedSnaps] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const poolSnaps = snapshots.filter(
    (s) => s.dataset === poolName || s.dataset.startsWith(`${poolName}/`)
  );

  const filteredSnaps = poolSnaps.filter(
    (s) =>
      s.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      s.dataset.toLowerCase().includes(searchValue.toLowerCase())
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSnaps(filteredSnaps.map((s) => s.name));
    } else {
      setSelectedSnaps([]);
    }
  };

  const handleSelectRow = (name: string, checked: boolean) => {
    if (checked) {
      setSelectedSnaps([...selectedSnaps, name]);
    } else {
      setSelectedSnaps(selectedSnaps.filter((n) => n !== name));
    }
  };

  const toggleDropdown = (snapName: string) => {
    setOpenDropdown(openDropdown === snapName ? null : snapName);
  };

  const selectedObjects = poolSnaps.filter((s) => selectedSnaps.includes(s.name));

  return (
    <div>
      <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "1rem" }}>
        <FlexItem>
          <Title headingLevel="h2" size="xl">
            Snapshots ({poolSnaps.length})
          </Title>
        </FlexItem>
        <FlexItem>
          <Flex>
            {selectedSnaps.length > 0 && (
              <FlexItem>
                <Button
                  variant="danger"
                  icon={<TrashIcon />}
                  onClick={() => onBulkDestroySnapshots(selectedObjects)}
                >
                  Delete Selected ({selectedSnaps.length})
                </Button>
              </FlexItem>
            )}
            <FlexItem>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={onCreateSnapshot}>
                Create Snapshot
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>
      </Flex>

      <div style={{ maxWidth: "400px", marginBottom: "1rem" }}>
        <SearchInput
          placeholder="Filter snapshots by name..."
          value={searchValue}
          onChange={(_event, value) => setSearchValue(value)}
          onClear={() => setSearchValue("")}
        />
      </div>

      <Table aria-label="Snapshots Table" variant="compact">
        <Thead>
          <Tr>
            <Th
              select={{
                onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
                isSelected: selectedSnaps.length > 0 && selectedSnaps.length === filteredSnaps.length,
              }}
            />
            <Th>Snapshot</Th>
            <Th>Dataset</Th>
            <Th>Creation Date</Th>
            <Th>Used</Th>
            <Th>Referenced</Th>
            <Th>Clones</Th>
            <Th aria-label="Actions" />
          </Tr>
        </Thead>
        <Tbody>
          {filteredSnaps.map((snap) => (
            <Tr key={snap.name}>
              <Td
                select={{
                  rowIndex: 0,
                  onSelect: (_event, isSelecting) => handleSelectRow(snap.name, isSelecting),
                  isSelected: selectedSnaps.includes(snap.name),
                }}
              />
              <Td dataLabel="Snapshot">
                <Flex alignItems={{ default: "alignItemsCenter" }}>
                  <FlexItem>
                    <CameraIcon style={{ color: "var(--pf-v5-global--primary-color--100)" }} />
                  </FlexItem>
                  <FlexItem>
                    <strong>@{snap.snapshot_name}</strong>
                  </FlexItem>
                </Flex>
              </Td>
              <Td dataLabel="Dataset">{snap.dataset}</Td>
              <Td dataLabel="Creation Date">{formatDate(snap.creation)}</Td>
              <Td dataLabel="Used">{formatBytes(snap.used)}</Td>
              <Td dataLabel="Referenced">{formatBytes(snap.refer)}</Td>
              <Td dataLabel="Clones">
                {snap.clones && snap.clones.length > 0 ? snap.clones.join(", ") : "-"}
              </Td>
              <Td isActionCell>
                <Dropdown
                  isOpen={openDropdown === snap.name}
                  onSelect={() => setOpenDropdown(null)}
                  onOpenChange={(isOpen) => setOpenDropdown(isOpen ? snap.name : null)}
                  toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      aria-label="Snapshot actions"
                      variant="plain"
                      onClick={() => toggleDropdown(snap.name)}
                      isExpanded={openDropdown === snap.name}
                    >
                      <EllipsisVIcon />
                    </MenuToggle>
                  )}
                >
                  <DropdownList>
                    <DropdownItem key="rollback" onClick={() => onRollbackSnapshot(snap)}>
                      Rollback Dataset
                    </DropdownItem>
                    <DropdownItem key="clone" onClick={() => onCloneSnapshot(snap)}>
                      Clone to New Dataset
                    </DropdownItem>
                    <DropdownItem key="rename" onClick={() => onRenameSnapshot(snap)}>
                      Rename Snapshot
                    </DropdownItem>
                    <DropdownItem key="destroy" style={{ color: "red" }} onClick={() => onDestroySnapshot(snap)}>
                      Destroy Snapshot
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
};
