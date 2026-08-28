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
  onCreateDataset: (parentDataset?: string) => void;
  onCreateZVol: (parentDataset?: string) => void;
  onEditProperties: (dataset: ZDataset) => void;
  onCreateSnapshot: (dataset: ZDataset) => void;
  onMountToggle: (dataset: ZDataset) => void;
  onRenameDataset: (dataset: ZDataset) => void;
  onDestroyDataset: (dataset: ZDataset) => void;
}

export const DatasetsTab: React.FC<DatasetsTabProps> = ({
  poolName,
  datasets,
  onCreateDataset,
  onCreateZVol,
  onEditProperties,
  onCreateSnapshot,
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
          <Title headingLevel="h2" size="xl" style={{ fontWeight: 600 }}>
            Datasets &amp; Volumes ({poolDatasets.length})
          </Title>
        </FlexItem>
        <FlexItem>
          <Flex>
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
              <Th>Snapshots</Th>
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
                          <FolderIcon style={{ color: "var(--pf-v5-global--primary-color--100)" }} />
                        ) : (
                          <HddIcon style={{ color: "var(--pf-v5-global--info-color--100)" }} />
                        )}
                      </FlexItem>
                      <FlexItem>
                        <strong>{displayName}</strong>
                        {depth > 0 && (
                          <span style={{ color: "var(--pf-v5-global--Color--200)", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
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
                  <Td dataLabel="Mountpoint">
                    {isFilesystem ? (
                      ds.mountpoint ? (
                        <Flex alignItems={{ default: "alignItemsCenter" }}>
                          <FlexItem>{ds.mountpoint}</FlexItem>
                          <FlexItem>
                            <Label color={ds.mounted ? "green" : "orange"} style={{ marginLeft: "0.5rem" }}>
                              {ds.mounted ? "Mounted" : "Unmounted"}
                            </Label>
                          </FlexItem>
                        </Flex>
                      ) : (
                        <span style={{ color: "var(--pf-v5-global--Color--200)" }}>None</span>
                      )
                    ) : (
                      <span style={{ color: "var(--pf-v5-global--Color--200)" }}>-</span>
                    )}
                  </Td>
                  <Td dataLabel="Compression">
                    {ds.compression !== "off" ? `${ds.compression} (${ds.compressratio}x)` : "off"}
                  </Td>
                  <Td dataLabel="Encryption">
                    {ds.encryption !== "off" ? (
                      <Flex alignItems={{ default: "alignItemsCenter" }}>
                        <FlexItem>
                          <LockIcon style={{ color: "var(--pf-v5-global--success-color--100)", fontSize: "0.85rem" }} />
                        </FlexItem>
                        <FlexItem>
                          <span>{ds.encryption}</span>
                        </FlexItem>
                      </Flex>
                    ) : (
                      <span style={{ color: "var(--pf-v5-global--Color--200)" }}>off</span>
                    )}
                  </Td>
                  <Td dataLabel="Snapshots">
                    <Label color="grey">{ds.snapshot_count}</Label>
                  </Td>
                  <Td isActionCell>
                    <Dropdown
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
