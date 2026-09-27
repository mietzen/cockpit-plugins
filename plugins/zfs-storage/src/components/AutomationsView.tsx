import React, { useState, useMemo } from "react";
import {
  PageSection,
  Title,
  Label,
  Flex,
  FlexItem,
  Button,
  Card,
  CardBody,
  SearchInput,
  Modal,
  ModalVariant,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from "@patternfly/react-table";
import {
  PlusCircleIcon,
  SyncAltIcon,
  PencilAltIcon,
  TrashIcon,
  ClockIcon,
  InfoCircleIcon,
} from "@patternfly/react-icons";
import { SanoidInfo, SanoidDatasetPolicy } from "../types";
import { SanoidScheduleModal } from "./Modals/SanoidScheduleModal";

interface AutomationsViewProps {
  sanoidInfo?: SanoidInfo | null;
  datasetOptions?: string[];
  onSaveSchedule?: (policy: SanoidDatasetPolicy) => Promise<void>;
  onDeleteSchedule?: (dataset: string) => Promise<void>;
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  sanoidInfo,
  datasetOptions = [],
  onSaveSchedule,
  onDeleteSchedule,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [sortIndex, setSortIndex] = useState<number | null>(0);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<SanoidDatasetPolicy | null>(null);
  const [deleteScheduleDataset, setDeleteScheduleDataset] = useState<string | null>(null);

  const getSortParams = (columnIndex: number): ThProps["sort"] => ({
    sortBy: {
      index: sortIndex ?? undefined,
      direction: sortDirection,
      defaultDirection: "asc",
    },
    onSort: (_event, index, direction) => {
      setSortIndex(index);
      setSortDirection(direction);
    },
    columnIndex,
  });

  const policies = sanoidInfo?.policies || [];

  const filteredPolicies = useMemo(() => {
    if (!searchValue.trim()) {
      return policies;
    }
    const q = searchValue.toLowerCase();
    return policies.filter(
      (p) =>
        p.dataset.toLowerCase().includes(q) ||
        (p.use_template && p.use_template.toLowerCase().includes(q)) ||
        (p.template && p.template.toLowerCase().includes(q))
    );
  }, [policies, searchValue]);

  const sortedPolicies = useMemo(() => {
    if (sortIndex === null) {
      return filteredPolicies;
    }
    return [...filteredPolicies].sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";

      if (sortIndex === 0) {
        aVal = a.dataset;
        bVal = b.dataset;
      } else if (sortIndex === 1) {
        aVal = a.use_template || a.template || "";
        bVal = b.use_template || b.template || "";
      } else if (sortIndex === 2) {
        aVal = a.hourly ?? -1;
        bVal = b.hourly ?? -1;
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      } else if (sortIndex === 3) {
        aVal = a.daily ?? -1;
        bVal = b.daily ?? -1;
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      } else if (sortIndex === 4) {
        aVal = a.monthly ?? -1;
        bVal = b.monthly ?? -1;
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      } else if (sortIndex === 5) {
        aVal = a.yearly ?? -1;
        bVal = b.yearly ?? -1;
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      } else if (sortIndex === 6) {
        aVal = a.recursive ? "yes" : "no";
        bVal = b.recursive ? "yes" : "no";
      }

      return sortDirection === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [filteredPolicies, sortIndex, sortDirection]);

  const isInstalled = Boolean(sanoidInfo?.installed);

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Snapshot Automations
            </Title>
            <p style={{ color: "var(--pf-v5-global--Color--200)", marginTop: "0.25rem", marginBottom: 0 }}>
              Policy-driven snapshot automation and retention schedules managed via Sanoid.
            </p>
          </FlexItem>

          {isInstalled && onSaveSchedule && (
            <FlexItem>
              <Button
                variant="primary"
                icon={<PlusCircleIcon />}
                onClick={() => {
                  setSelectedPolicy(null);
                  setIsScheduleModalOpen(true);
                }}
              >
                Add Schedule
              </Button>
            </FlexItem>
          )}
        </Flex>

        {isInstalled && (
          <Flex gap={{ default: "gapMd" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginTop: "1rem" }}>
            <FlexItem>
              <Label
                color={sanoidInfo?.sanoid_timer_active ? "green" : "grey"}
                icon={<SyncAltIcon />}
              >
                Sanoid Timer: {sanoidInfo?.sanoid_timer_active ? "Active" : "Inactive"}
              </Label>
            </FlexItem>
            <FlexItem>
              <Label color="blue">
                Configured Schedules: {policies.length}
              </Label>
            </FlexItem>
          </Flex>
        )}
      </PageSection>

      <PageSection>
        {!isInstalled ? (
          <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", background: "var(--zfs-card-bg)" }}>
            <CardBody>
              <EmptyState variant="lg">
                <EmptyStateHeader
                  titleText="Sanoid is not installed"
                  headingLevel="h2"
                  icon={<EmptyStateIcon icon={InfoCircleIcon} style={{ color: "var(--pf-v5-global--info-color--100)" }} />}
                />
                <EmptyStateBody>
                  Sanoid is a policy-driven snapshot management tool for OpenZFS.
                  Install the <code>sanoid</code> package on this host to configure automated snapshot creation, retention schedules, and automatic pruning.
                </EmptyStateBody>
              </EmptyState>
            </CardBody>
          </Card>
        ) : (
          <Card isPlain style={{ border: "1px solid var(--zfs-card-border)" }}>
            <CardBody>
              <div style={{ marginBottom: "1rem", maxWidth: "350px" }}>
                <SearchInput
                  placeholder="Search snapshot schedules..."
                  value={searchValue}
                  onChange={(_event, val) => setSearchValue(val)}
                  onClear={() => setSearchValue("")}
                />
              </div>

              {policies.length === 0 ? (
                <EmptyState variant="sm">
                  <EmptyStateHeader
                    titleText="No snapshot schedules configured"
                    headingLevel="h3"
                    icon={<EmptyStateIcon icon={ClockIcon} />}
                  />
                  <EmptyStateBody>
                    No dataset snapshot schedules were found in <code>/etc/sanoid/sanoid.conf</code>.
                    Click "Add Schedule" to configure automated snapshot retention policies.
                  </EmptyStateBody>
                </EmptyState>
              ) : (
                <Table aria-label="Sanoid Policies Table" variant="compact">
                  <Thead>
                    <Tr>
                      <Th sort={getSortParams(0)}>Dataset / Path</Th>
                      <Th sort={getSortParams(1)}>Template</Th>
                      <Th sort={getSortParams(2)}>Hourly</Th>
                      <Th sort={getSortParams(3)}>Daily</Th>
                      <Th sort={getSortParams(4)}>Monthly</Th>
                      <Th sort={getSortParams(5)}>Yearly</Th>
                      <Th>Autosnap / Autoprune</Th>
                      <Th sort={getSortParams(6)}>Recursive</Th>
                      {(onSaveSchedule || onDeleteSchedule) && (
                        <Th style={{ textAlign: "right" }}>Actions</Th>
                      )}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sortedPolicies.map((p) => (
                      <Tr key={p.dataset}>
                        <Td dataLabel="Dataset">
                          <strong>{p.dataset}</strong>
                        </Td>
                        <Td dataLabel="Template">{p.use_template || p.template || "Custom"}</Td>
                        <Td dataLabel="Hourly">{p.hourly !== undefined ? p.hourly : "—"}</Td>
                        <Td dataLabel="Daily">{p.daily !== undefined ? p.daily : "—"}</Td>
                        <Td dataLabel="Monthly">{p.monthly !== undefined ? p.monthly : "—"}</Td>
                        <Td dataLabel="Yearly">{p.yearly !== undefined ? p.yearly : "—"}</Td>
                        <Td dataLabel="Autosnap / Autoprune">
                          <Flex gap={{ default: "gapXs" }}>
                            <Label color={p.autosnap !== false ? "green" : "grey"}>
                              Snap: {p.autosnap !== false ? "on" : "off"}
                            </Label>
                            <Label color={p.autoprune !== false ? "blue" : "grey"}>
                              Prune: {p.autoprune !== false ? "on" : "off"}
                            </Label>
                          </Flex>
                        </Td>
                        <Td dataLabel="Recursive">{p.recursive ? "Yes" : "No"}</Td>
                        {(onSaveSchedule || onDeleteSchedule) && (
                          <Td dataLabel="Actions" style={{ textAlign: "right" }}>
                            <Flex justifyContent={{ default: "justifyContentFlexEnd" }} gap={{ default: "gapXs" }}>
                              {onSaveSchedule && (
                                <Button
                                  variant="plain"
                                  aria-label={`Edit schedule for ${p.dataset}`}
                                  onClick={() => {
                                    setSelectedPolicy(p);
                                    setIsScheduleModalOpen(true);
                                  }}
                                >
                                  <PencilAltIcon />
                                </Button>
                              )}
                              {onDeleteSchedule && (
                                <Button
                                  variant="plain"
                                  aria-label={`Delete schedule for ${p.dataset}`}
                                  onClick={() => setDeleteScheduleDataset(p.dataset)}
                                >
                                  <TrashIcon style={{ color: "var(--pf-v5-global--danger-color--100)" }} />
                                </Button>
                              )}
                            </Flex>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        )}

        {isScheduleModalOpen && onSaveSchedule && (
          <SanoidScheduleModal
            isOpen={isScheduleModalOpen}
            policy={selectedPolicy}
            datasetOptions={datasetOptions}
            templates={sanoidInfo?.templates || {}}
            onClose={() => {
              setIsScheduleModalOpen(false);
              setSelectedPolicy(null);
            }}
            onSubmit={async (policy) => {
              await onSaveSchedule(policy);
            }}
          />
        )}

        {deleteScheduleDataset && onDeleteSchedule && (
          <Modal
            variant={ModalVariant.small}
            title="Delete Snapshot Schedule"
            isOpen={Boolean(deleteScheduleDataset)}
            onClose={() => setDeleteScheduleDataset(null)}
            appendTo={() => document.body}
            actions={[
              <Button
                key="confirm"
                variant="danger"
                onClick={async () => {
                  const ds = deleteScheduleDataset;
                  setDeleteScheduleDataset(null);
                  await onDeleteSchedule(ds);
                }}
              >
                Delete Schedule
              </Button>,
              <Button key="cancel" variant="secondary" onClick={() => setDeleteScheduleDataset(null)}>
                Cancel
              </Button>,
            ]}
          >
            Are you sure you want to remove the snapshot schedule for <strong>{deleteScheduleDataset}</strong>?
          </Modal>
        )}
      </PageSection>
    </>
  );
};
