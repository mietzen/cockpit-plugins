import React, { useState } from "react";
import {
  Button,
  Flex,
  FlexItem,
  Label,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Title,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import {
  FolderIcon,
  HddIcon,
  PlusCircleIcon,
  EllipsisVIcon,
  LockIcon,
} from "@patternfly/react-icons";
import { ZDataset } from "../types";
import { formatBytes } from "../utils/formatters";

interface DatasetsTabProps {
  poolName: string;
  datasets: ZDataset[];
  isLoading?: boolean;
  onCreateDataset: (parentDataset?: string) => void;
  onCreateZVol: (parentDataset?: string) => void;
  onEditProperties: (dataset: ZDataset) => void;
  onCreateSnapshot: (dataset: ZDataset) => void;
  onViewSnapshots?: (datasetName: string) => void;
  onMountToggle: (dataset: ZDataset) => void;
  onRenameDataset: (dataset: ZDataset) => void;
  onDestroyDataset: (dataset: ZDataset) => void;
}

export const DatasetsTab: React.FC<DatasetsTabProps> = ({
  poolName,
  datasets,
  isLoading = false,
  onCreateDataset,
  onCreateZVol,
  onEditProperties,
  onCreateSnapshot,
  onViewSnapshots,
  onMountToggle,
  onRenameDataset,
  onDestroyDataset,
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (dsName: string) => {
    setOpenDropdown(openDropdown === dsName ? null : dsName);
  };

  const poolDatasets = datasets.filter(
    (d) => d.name === poolName || d.name.startsWith(`${poolName}/`)
  );

  return (
    <div>
      <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "1.5rem" }}>
        <FlexItem>
          <Title headingLevel="h2" size="xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
            Datasets &amp; Volumes ({poolDatasets.length})
          </Title>
        </FlexItem>
        <FlexItem>
          <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
            <FlexItem>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => onCreateDataset(poolName)}>
                Create dataset
              </Button>
            </FlexItem>
            <FlexItem>
              <Button variant="secondary" icon={<PlusCircleIcon />} onClick={() => onCreateZVol(poolName)}>
                Create volume
              </Button>
            </FlexItem>
          </Flex>
        </FlexItem>
      </Flex>

      {poolDatasets.length === 0 ? (
        isLoading ? null : (
          <EmptyState>
            <EmptyStateHeader
              titleText="No datasets found"
              icon={<EmptyStateIcon icon={FolderIcon} />}
              headingLevel="h4"
            />
            <EmptyStateBody>
              No datasets or volumes have been created under pool {poolName}.
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => onCreateDataset(poolName)}>
                  Create dataset
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        )
      ) : (
        <Table aria-label="Datasets Table" variant="compact">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Used</Th>
              <Th>Available</Th>
              <Th>Mountpoint</Th>
              <Th>Compression</Th>
              <Th>Encryption</Th>
              <Th style={{ textAlign: "center" }}>Snapshots</Th>
              <Th aria-label="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {poolDatasets.map((ds) => {
              const depth = (ds.name.match(/\//g) || []).length;
              const displayName = depth > 0 ? ds.name.split("/").pop() : ds.name;
              const isFilesystem = ds.type === "filesystem";

              return (
                <Tr key={ds.name}>
                  <Td dataLabel="Name" style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}>
                    <Flex alignItems={{ default: "alignItemsCenter" }}>
                      <FlexItem>
                        {isFilesystem ? (
                          <FolderIcon style={{ color: "rgb(146, 197, 249)" }} />
                        ) : (
                          <HddIcon style={{ color: "#b886f8" }} />
                        )}
                      </FlexItem>
                      <FlexItem>
                        <strong>{displayName}</strong>
                        {depth > 0 && (
                          <span style={{ color: "#999999", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                            ({ds.name})
                          </span>
                        )}
                      </FlexItem>
                    </Flex>
                  </Td>
                  <Td dataLabel="Type">
                    <Label color={isFilesystem ? "blue" : "purple"}>{isFilesystem ? "Filesystem" : "Volume"}</Label>
                  </Td>
                  <Td dataLabel="Used">{formatBytes(ds.used)}</Td>
                  <Td dataLabel="Available">{formatBytes(ds.avail)}</Td>
                  <Td dataLabel="Mountpoint" style={{ minWidth: "220px" }}>
                    {isFilesystem ? (
                      ds.mountpoint ? (
                        <Flex
                          justifyContent={{ default: "justifyContentSpaceBetween" }}
                          alignItems={{ default: "alignItemsCenter" }}
                          style={{ width: "100%" }}
                        >
                          <FlexItem style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ds.mountpoint}
                          </FlexItem>
                          <FlexItem style={{ marginLeft: "auto", flexShrink: 0 }}>
                            <Label color={ds.mounted ? "green" : "orange"}>
                              {ds.mounted ? "Mounted" : "Unmounted"}
                            </Label>
                          </FlexItem>
                        </Flex>
                      ) : (
                        <span style={{ color: "#999999" }}>None</span>
                      )
                    ) : (
                      <span style={{ color: "#999999" }}>-</span>
                    )}
                  </Td>
                  <Td dataLabel="Compression">
                    {ds.compression !== "off" ? `${ds.compression} (${ds.compressratio}x)` : "off"}
                  </Td>
                  <Td dataLabel="Encryption">
                    {ds.encryption !== "off" ? (
                      <Flex alignItems={{ default: "alignItemsCenter" }}>
                        <FlexItem>
                          <LockIcon style={{ color: "#5ba352", fontSize: "0.85rem" }} />
                        </FlexItem>
                        <FlexItem>
                          <span>{ds.encryption}</span>
                        </FlexItem>
                      </Flex>
                    ) : (
                      <span style={{ color: "#999999" }}>off</span>
                    )}
                  </Td>
                  <Td dataLabel="Snapshots" style={{ textAlign: "center" }}>
                    {ds.snapshot_count > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (onViewSnapshots) {
                            onViewSnapshots(ds.name);
                          }
                        }}
                        aria-label={`View ${ds.snapshot_count} snapshots for ${ds.name}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          backgroundColor: "rgba(146, 197, 249, 0.2)",
                          color: "var(--zfs-tab-active-color)",
                          padding: "2px 12px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          minWidth: "32px",
                          height: "24px",
                          cursor: "pointer",
                          textDecoration: "none",
                          border: "1px solid rgba(146, 197, 249, 0.4)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {ds.snapshot_count}
                      </button>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          backgroundColor: "var(--zfs-card-bg)",
                          color: "var(--zfs-text-secondary)",
                          padding: "2px 12px",
                          fontSize: "0.85rem",
                          border: "1px solid var(--zfs-card-border)",
                          minWidth: "32px",
                          height: "24px",
                        }}
                      >
                        0
                      </span>
                    )}
                  </Td>
                  <Td isActionCell>
                    <Dropdown
                      popperProps={{ position: "right", preventOverflow: true }}
                      isOpen={openDropdown === ds.name}
                      onSelect={() => setOpenDropdown(null)}
                      onOpenChange={(isOpen) => setOpenDropdown(isOpen ? ds.name : null)}
                      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                        <MenuToggle
                          ref={toggleRef}
                          aria-label="Dataset actions"
                          variant="plain"
                          onClick={() => toggleDropdown(ds.name)}
                          isExpanded={openDropdown === ds.name}
                        >
                          <EllipsisVIcon />
                        </MenuToggle>
                      )}
                    >
                      <DropdownList>
                        {isFilesystem && (
                          <DropdownItem key="new-child-ds" onClick={() => onCreateDataset(ds.name)}>
                            Create child dataset
                          </DropdownItem>
                        )}
                        {isFilesystem && (
                          <DropdownItem key="new-child-zvol" onClick={() => onCreateZVol(ds.name)}>
                            Create child volume
                          </DropdownItem>
                        )}
                        <DropdownItem key="snap" onClick={() => onCreateSnapshot(ds)}>
                          Create snapshot
                        </DropdownItem>
                        <DropdownItem key="props" onClick={() => onEditProperties(ds)}>
                          Edit properties
                        </DropdownItem>
                        {isFilesystem && ds.mountpoint && (
                          <DropdownItem key="mount" onClick={() => onMountToggle(ds)}>
                            {ds.mounted ? "Unmount" : "Mount"}
                          </DropdownItem>
                        )}
                        <DropdownItem key="rename" onClick={() => onRenameDataset(ds)}>
                          Rename
                        </DropdownItem>
                        <DropdownItem key="destroy" style={{ color: "red" }} onClick={() => onDestroyDataset(ds)}>
                          Destroy
                        </DropdownItem>
                      </DropdownList>
                    </Dropdown>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
};
