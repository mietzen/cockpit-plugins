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
  EmptyStateFooter,
  EmptyStateActions,
  Spinner,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from "@patternfly/react-table";
import {
  PlusCircleIcon,
  SyncAltIcon,
  PencilAltIcon,
  TrashIcon,
  ClockIcon,
  InfoCircleIcon,
  SearchIcon,
} from "@patternfly/react-icons";
import { SanoidInfo, SanoidDatasetPolicy } from "../types";
import { SanoidScheduleModal } from "./Modals/SanoidScheduleModal";

export enum PolicySortColumn {
  Dataset = 0,
  Template = 1,
  Hourly = 2,
  Daily = 3,
  Monthly = 4,
  Yearly = 5,
  Recursive = 6,
}

const compareNumeric = (firstVal?: number, secondVal?: number, direction: "asc" | "desc" = "asc"): number => {
  const first = firstVal ?? -1;
  const second = secondVal ?? -1;
  return direction === "asc" ? first - second : second - first;
};

interface AutomationsViewProps {
  sanoidInfo?: SanoidInfo | null;
  datasetOptions?: string[];
  isLoading?: boolean;
  onSaveSchedule?: (policy: SanoidDatasetPolicy) => Promise<void>;
  onDeleteSchedule?: (dataset: string) => Promise<void>;
}

export const AutomationsView: React.FC<AutomationsViewProps> = ({
  sanoidInfo,
  datasetOptions = [],
  isLoading = false,
  onSaveSchedule,
  onDeleteSchedule,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [sortIndex, setSortIndex] = useState<number | null>(PolicySortColumn.Dataset);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<SanoidDatasetPolicy | null>(null);
  const [deleteDatasetTarget, setDeleteDatasetTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    const trimmedQuery = searchValue.trim().toLowerCase();
    if (!trimmedQuery) {
      return policies;
    }

    return policies.filter((policy) => {
      const datasetMatch = policy.dataset.toLowerCase().includes(trimmedQuery);
      const templateMatch = (policy.use_template || policy.template || "").toLowerCase().includes(trimmedQuery);
      return datasetMatch || templateMatch;
    });
  }, [policies, searchValue]);

  const sortedPolicies = useMemo(() => {
    if (sortIndex === null) {
      return filteredPolicies;
    }

    return [...filteredPolicies].sort((firstPolicy, secondPolicy) => {
      if (sortIndex === PolicySortColumn.Dataset) {
        const result = firstPolicy.dataset.localeCompare(secondPolicy.dataset);
        return sortDirection === "asc" ? result : -result;
      }

      if (sortIndex === PolicySortColumn.Template) {
        const firstTemplate = firstPolicy.use_template || firstPolicy.template || "";
        const secondTemplate = secondPolicy.use_template || secondPolicy.template || "";
        const result = firstTemplate.localeCompare(secondTemplate);
        return sortDirection === "asc" ? result : -result;
      }

      if (sortIndex === PolicySortColumn.Hourly) {
        return compareNumeric(firstPolicy.hourly, secondPolicy.hourly, sortDirection);
      }

      if (sortIndex === PolicySortColumn.Daily) {
        return compareNumeric(firstPolicy.daily, secondPolicy.daily, sortDirection);
      }

      if (sortIndex === PolicySortColumn.Monthly) {
        return compareNumeric(firstPolicy.monthly, secondPolicy.monthly, sortDirection);
      }

      if (sortIndex === PolicySortColumn.Yearly) {
        return compareNumeric(firstPolicy.yearly, secondPolicy.yearly, sortDirection);
      }

      if (sortIndex === PolicySortColumn.Recursive) {
        const first = firstPolicy.recursive ? 1 : 0;
        const second = secondPolicy.recursive ? 1 : 0;
        return sortDirection === "asc" ? first - second : second - first;
      }

      return 0;
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
        {isLoading && !sanoidInfo ? (
          <Card isPlain style={{ border: "1px solid var(--zfs-card-border)", background: "var(--zfs-card-bg)" }}>
            <CardBody>
              <EmptyState variant="lg">
                <EmptyStateHeader
                  titleText="Loading automations..."
                  headingLevel="h2"
                  icon={<EmptyStateIcon icon={Spinner} />}
                />
              </EmptyState>
            </CardBody>
          </Card>
        ) : !isInstalled ? (
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
              ) : filteredPolicies.length === 0 ? (
                <EmptyState variant="sm">
                  <EmptyStateHeader
                    titleText="No matching snapshot schedules"
                    headingLevel="h3"
                    icon={<EmptyStateIcon icon={SearchIcon} />}
                  />
                  <EmptyStateBody>
                    No configured policies matched your search <strong>"{searchValue}"</strong>.
                  </EmptyStateBody>
                  <EmptyStateFooter>
                    <EmptyStateActions>
                      <Button variant="link" onClick={() => setSearchValue("")}>
                        Clear search
                      </Button>
                    </EmptyStateActions>
                  </EmptyStateFooter>
                </EmptyState>
              ) : (
                <Table aria-label="Sanoid Policies Table" variant="compact">
                  <Thead>
                    <Tr>
                      <Th sort={getSortParams(PolicySortColumn.Dataset)}>Dataset / Path</Th>
                      <Th sort={getSortParams(PolicySortColumn.Template)}>Template</Th>
                      <Th sort={getSortParams(PolicySortColumn.Hourly)}>Hourly</Th>
                      <Th sort={getSortParams(PolicySortColumn.Daily)}>Daily</Th>
                      <Th sort={getSortParams(PolicySortColumn.Monthly)}>Monthly</Th>
                      <Th sort={getSortParams(PolicySortColumn.Yearly)}>Yearly</Th>
                      <Th>Autosnap / Autoprune</Th>
                      <Th sort={getSortParams(PolicySortColumn.Recursive)}>Recursive</Th>
                      {(onSaveSchedule || onDeleteSchedule) && (
                        <Th style={{ textAlign: "right" }}>Actions</Th>
                      )}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sortedPolicies.map((policy) => (
                      <Tr key={policy.dataset}>
                        <Td dataLabel="Dataset">
                          <strong>{policy.dataset}</strong>
                        </Td>
                        <Td dataLabel="Template">{policy.use_template || policy.template || "Custom"}</Td>
                        <Td dataLabel="Hourly">{policy.hourly !== undefined ? policy.hourly : "—"}</Td>
                        <Td dataLabel="Daily">{policy.daily !== undefined ? policy.daily : "—"}</Td>
                        <Td dataLabel="Monthly">{policy.monthly !== undefined ? policy.monthly : "—"}</Td>
                        <Td dataLabel="Yearly">{policy.yearly !== undefined ? policy.yearly : "—"}</Td>
                        <Td dataLabel="Autosnap / Autoprune">
                          <Flex gap={{ default: "gapXs" }}>
                            <Label color={policy.autosnap !== false ? "green" : "grey"}>
                              Snap: {policy.autosnap !== false ? "on" : "off"}
                            </Label>
                            <Label color={policy.autoprune !== false ? "blue" : "grey"}>
                              Prune: {policy.autoprune !== false ? "on" : "off"}
                            </Label>
                          </Flex>
                        </Td>
                        <Td dataLabel="Recursive">{policy.recursive ? "Yes" : "No"}</Td>
                        {(onSaveSchedule || onDeleteSchedule) && (
                          <Td dataLabel="Actions" style={{ textAlign: "right" }}>
                            <Flex justifyContent={{ default: "justifyContentFlexEnd" }} gap={{ default: "gapXs" }}>
                              {onSaveSchedule && (
                                <Button
                                  variant="plain"
                                  aria-label={`Edit schedule for ${policy.dataset}`}
                                  onClick={() => {
                                    setSelectedPolicy(policy);
                                    setIsScheduleModalOpen(true);
                                  }}
                                >
                                  <PencilAltIcon />
                                </Button>
                              )}
                              {onDeleteSchedule && (
                                <Button
                                  variant="plain"
                                  aria-label={`Delete schedule for ${policy.dataset}`}
                                  onClick={() => setDeleteDatasetTarget(policy.dataset)}
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

        {deleteDatasetTarget && onDeleteSchedule && (
          <Modal
            variant={ModalVariant.small}
            title="Delete Snapshot Schedule"
            isOpen={Boolean(deleteDatasetTarget)}
            onClose={() => {
              if (!isDeleting) {
                setDeleteDatasetTarget(null);
              }
            }}
            appendTo={() => document.body}
            actions={[
              <Button
                key="confirm"
                variant="danger"
                isLoading={isDeleting}
                isDisabled={isDeleting}
                onClick={async () => {
                  const target = deleteDatasetTarget;
                  setIsDeleting(true);
                  try {
                    await onDeleteSchedule(target);
                    setDeleteDatasetTarget(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                Delete Schedule
              </Button>,
              <Button
                key="cancel"
                variant="link"
                isDisabled={isDeleting}
                onClick={() => {
                  if (!isDeleting) {
                    setDeleteDatasetTarget(null);
                  }
                }}
              >
                Cancel
              </Button>,
            ]}
          >
            Are you sure you want to remove the snapshot schedule for <strong>{deleteDatasetTarget}</strong>?
          </Modal>
        )}
      </PageSection>
    </>
  );
};
