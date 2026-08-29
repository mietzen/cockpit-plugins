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
  Card,
  CardHeader,
  CardBody,
  Badge,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import {
  CameraIcon,
  PlusCircleIcon,
  TrashIcon,
  EllipsisVIcon,
  FolderIcon,
  AngleDownIcon,
  AngleRightIcon,
  CompressArrowsAltIcon,
  ExpandArrowsAltIcon,
} from "@patternfly/react-icons";
import { ZSnapshot } from "../types";
import { formatBytes, formatDate } from "../utils/formatters";

interface SnapshotsTabProps {
  poolName: string;
  snapshots: ZSnapshot[];
  isLoading?: boolean;
  onCreateSnapshot: (targetDataset?: string) => void;
  onRollbackSnapshot: (snapshot: ZSnapshot) => void;
  onCloneSnapshot: (snapshot: ZSnapshot) => void;
  onRenameSnapshot: (snapshot: ZSnapshot) => void;
  onDestroySnapshot: (snapshot: ZSnapshot) => void;
  onBulkDestroySnapshots: (snapshots: ZSnapshot[]) => void;
}

export const SnapshotsTab: React.FC<SnapshotsTabProps> = ({
  poolName,
  snapshots,
  isLoading = false,
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
  const [collapsedDatasets, setCollapsedDatasets] = useState<Set<string>>(new Set());

  const poolSnaps = snapshots.filter(
    (s) => s.dataset === poolName || s.dataset.startsWith(`${poolName}/`)
  );

  const filteredSnaps = poolSnaps.filter(
    (s) =>
      s.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      s.dataset.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Group snapshots by dataset
  const datasetGroups: { dataset: string; snapshots: ZSnapshot[] }[] = [];
  const datasetMap = new Map<string, ZSnapshot[]>();

  for (const snap of filteredSnaps) {
    if (!datasetMap.has(snap.dataset)) {
      datasetMap.set(snap.dataset, []);
    }
    datasetMap.get(snap.dataset)!.push(snap);
  }

  // Sort datasets alphabetically (root pool first, then children)
  const sortedDatasets = Array.from(datasetMap.keys()).sort((a, b) => {
    if (a === poolName) return -1;
    if (b === poolName) return 1;
    return a.localeCompare(b);
  });

  for (const ds of sortedDatasets) {
    datasetGroups.push({
      dataset: ds,
      snapshots: datasetMap.get(ds) || [],
    });
  }

  const toggleDatasetCollapse = (dsName: string) => {
    setCollapsedDatasets((prev) => {
      const next = new Set(prev);
      if (next.has(dsName)) {
        next.delete(dsName);
      } else {
        next.add(dsName);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setCollapsedDatasets(new Set());
  };

  const handleCollapseAll = () => {
    setCollapsedDatasets(new Set(sortedDatasets));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSnaps(filteredSnaps.map((s) => s.name));
    } else {
      setSelectedSnaps([]);
    }
  };

  const handleSelectGroup = (groupSnaps: ZSnapshot[], checked: boolean) => {
    const snapNames = groupSnaps.map((s) => s.name);
    if (checked) {
      setSelectedSnaps((prev) => Array.from(new Set([...prev, ...snapNames])));
    } else {
      setSelectedSnaps((prev) => prev.filter((n) => !snapNames.includes(n)));
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
      <Flex
        justifyContent={{ default: "justifyContentSpaceBetween" }}
        alignItems={{ default: "alignItemsCenter" }}
        style={{ marginBottom: "1.5rem" }}
      >
        <FlexItem>
          <Title headingLevel="h2" size="xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
            Snapshots ({poolSnaps.length})
          </Title>
        </FlexItem>
        <FlexItem>
          <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
            {selectedSnaps.length > 0 && (
              <FlexItem>
                <Button
                  variant="danger"
                  icon={<TrashIcon />}
                  onClick={() => onBulkDestroySnapshots(selectedObjects)}
                >
                  Delete selected ({selectedSnaps.length})
                </Button>
              </FlexItem>
            )}
            <FlexItem>
              <Button
                variant="primary"
                icon={<PlusCircleIcon />}
                onClick={() => onCreateSnapshot()}
              >
                Create snapshot
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>
      </Flex>

      {poolSnaps.length === 0 ? (
        isLoading ? null : (
          <EmptyState>
            <EmptyStateHeader
              titleText="No snapshots taken"
              icon={<EmptyStateIcon icon={CameraIcon} />}
              headingLevel="h4"
            />
            <EmptyStateBody>
              Snapshots are point-in-time read-only copies of your datasets. They take no initial space until data blocks change.
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => onCreateSnapshot()}>
                  Create snapshot
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )
      ) : (
        <>
          <Flex
            justifyContent={{ default: "justifyContentSpaceBetween" }}
            alignItems={{ default: "alignItemsCenter" }}
            style={{ marginBottom: "1rem" }}
          >
            <FlexItem style={{ maxWidth: "350px", width: "100%" }}>
              <SearchInput
                placeholder="Filter snapshots by name or dataset..."
                value={searchValue}
                onChange={(_event, value) => setSearchValue(value)}
                onClear={() => setSearchValue("")}
              />
            </FlexItem>
            <FlexItem>
              <Flex gap={{ default: "gapSm" }}>
                <Button
                  variant="plain"
                  icon={<ExpandArrowsAltIcon />}
                  onClick={handleExpandAll}
                  aria-label="Expand all datasets"
                  title="Expand all datasets"
                >
                  Expand all
                </Button>
                <Button
                  variant="plain"
                  icon={<CompressArrowsAltIcon />}
                  onClick={handleCollapseAll}
                  aria-label="Collapse all datasets"
                  title="Collapse all datasets"
                >
                  Collapse all
                </Button>
              </Flex>
            </FlexItem>
          </Flex>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {datasetGroups.map((group) => {
              const isCollapsed = collapsedDatasets.has(group.dataset);
              const groupSnapNames = group.snapshots.map((s) => s.name);
              const isGroupAllSelected =
                groupSnapNames.length > 0 &&
                groupSnapNames.every((name) => selectedSnaps.includes(name));

              return (
                <Card key={group.dataset} isCompact style={{ overflow: "hidden" }}>
                  <CardHeader
                    style={{
                      cursor: "pointer",
                      backgroundColor: "var(--zfs-card-bg)",
                      borderBottom: isCollapsed ? "none" : "1px solid var(--zfs-card-border)",
                    }}
                    onClick={() => toggleDatasetCollapse(group.dataset)}
                  >
                    <Flex
                      justifyContent={{ default: "justifyContentSpaceBetween" }}
                      alignItems={{ default: "alignItemsCenter" }}
                      style={{ width: "100%" }}
                    >
                      <FlexItem>
                        <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
                          <FlexItem>
                            {isCollapsed ? <AngleRightIcon /> : <AngleDownIcon />}
                          </FlexItem>
                          <FlexItem>
                            <FolderIcon style={{ color: "rgb(146, 197, 249)" }} />
                          </FlexItem>
                          <FlexItem>
                            <strong style={{ fontSize: "1rem" }}>{group.dataset}</strong>
                          </FlexItem>
                          <FlexItem>
                            <Badge isRead>
                              {group.snapshots.length} snapshot{group.snapshots.length === 1 ? "" : "s"}
                            </Badge>
                          </FlexItem>
                        </Flex>
                      </FlexItem>
                      <FlexItem onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="link"
                          icon={<PlusCircleIcon />}
                          onClick={() => onCreateSnapshot(group.dataset)}
                          style={{ padding: "0 0.5rem" }}
                        >
                          Create snapshot
                        </Button>
                      </FlexItem>
                    </Flex>
                  </CardHeader>

                  {!isCollapsed && (
                    <CardBody style={{ padding: 0 }}>
                      <Table aria-label={`Snapshots for ${group.dataset}`} variant="compact">
                        <Thead>
                          <Tr>
                            <Th
                              select={{
                                onSelect: (_event, isSelecting) =>
                                  handleSelectGroup(group.snapshots, isSelecting),
                                isSelected: isGroupAllSelected,
                              }}
                            />
                            <Th>Snapshot</Th>
                            <Th>Creation date</Th>
                            <Th>Used</Th>
                            <Th>Referenced</Th>
                            <Th>Clones</Th>
                            <Th aria-label="Actions" />
                          </Tr>
                        </Thead>
                        <Tbody>
                          {group.snapshots.map((snap) => (
                            <Tr key={snap.name}>
                              <Td
                                select={{
                                  rowIndex: 0,
                                  onSelect: (_event, isSelecting) =>
                                    handleSelectRow(snap.name, isSelecting),
                                  isSelected: selectedSnaps.includes(snap.name),
                                }}
                              />
                              <Td dataLabel="Snapshot">
                                <Flex alignItems={{ default: "alignItemsCenter" }}>
                                  <FlexItem>
                                    <CameraIcon style={{ color: "rgb(146, 197, 249)" }} />
                                  </FlexItem>
                                  <FlexItem>
                                    <strong>@{snap.snapshot_name}</strong>
                                  </FlexItem>
                                </Flex>
                              </Td>
                              <Td dataLabel="Creation date">{formatDate(snap.creation)}</Td>
                              <Td dataLabel="Used">{formatBytes(snap.used)}</Td>
                              <Td dataLabel="Referenced">{formatBytes(snap.refer)}</Td>
                              <Td dataLabel="Clones">
                                {snap.clones && snap.clones.length > 0
                                  ? snap.clones.join(", ")
                                  : "-"}
                              </Td>
                              <Td isActionCell>
                                <Dropdown
                                  popperProps={{ position: "right", preventOverflow: true }}
                                  isOpen={openDropdown === snap.name}
                                  onSelect={() => setOpenDropdown(null)}
                                  onOpenChange={(isOpen) =>
                                    setOpenDropdown(isOpen ? snap.name : null)
                                  }
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
                                    <DropdownItem
                                      key="rollback"
                                      onClick={() => onRollbackSnapshot(snap)}
                                    >
                                      Rollback dataset
                                    </DropdownItem>
                                    <DropdownItem
                                      key="clone"
                                      onClick={() => onCloneSnapshot(snap)}
                                    >
                                      Clone to new dataset
                                    </DropdownItem>
                                    <DropdownItem
                                      key="rename"
                                      onClick={() => onRenameSnapshot(snap)}
                                    >
                                      Rename snapshot
                                    </DropdownItem>
                                    <DropdownItem
                                      key="destroy"
                                      style={{ color: "red" }}
                                      onClick={() => onDestroySnapshot(snap)}
                                    >
                                      Destroy snapshot
                                    </DropdownItem>
                                  </DropdownList>
                                </Dropdown>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </CardBody>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
