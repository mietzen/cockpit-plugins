import React, { useState } from "react";
import {
  PageSection,
  Title,
  Button,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Card,
  CardTitle,
  CardBody,
  Label,
  Badge,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td, ThProps } from "@patternfly/react-table";
import {
  SyncAltIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  RedoIcon,
  ServerIcon,
  DesktopIcon,
} from "@patternfly/react-icons";
import { ServiceStatus, SmbSession } from "../types";

interface SessionsTabProps {
  services: {
    smbd: ServiceStatus;
    nmbd: ServiceStatus;
    nfs: ServiceStatus;
  };
  sessions: SmbSession[];
  onServiceAction: (service: string, verb: "restart" | "reload") => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  services,
  sessions,
  onServiceAction,
  onRefresh,
}) => {
  const [sortIndex, setSortIndex] = useState<number | null>(0);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const getSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: sortIndex ?? undefined,
      direction: sortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setSortIndex(index);
      setSortDirection(direction);
    },
    columnIndex,
  });

  const sortedSessions = React.useMemo(() => {
    if (sortIndex === null) {
      return sessions;
    }
    return [...sessions].sort((a, b) => {
      if (sortIndex === 0) {
        const aVal = a.group || '';
        const bVal = b.group || '';
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else if (sortIndex === 1) {
        return sortDirection === 'asc' ? a.username.localeCompare(b.username) : b.username.localeCompare(a.username);
      } else if (sortIndex === 2) {
        return sortDirection === 'asc' ? a.machine.localeCompare(b.machine) : b.machine.localeCompare(a.machine);
      } else if (sortIndex === 3) {
        const aPid = parseInt(a.pid, 10) || 0;
        const bPid = parseInt(b.pid, 10) || 0;
        return sortDirection === 'asc' ? aPid - bPid : bPid - aPid;
      } else if (sortIndex === 4) {
        return sortDirection === 'asc' ? a.protocol.localeCompare(b.protocol) : b.protocol.localeCompare(a.protocol);
      }
      return 0;
    });
  }, [sessions, sortIndex, sortDirection]);

  const serviceList = [
    { name: "Samba File Daemon (smbd)", id: "smbd", status: services.smbd },
    { name: "NetBIOS Name Daemon (nmbd)", id: "nmbd", status: services.nmbd },
    { name: "NFS Server Daemon (nfs)", id: "nfs", status: services.nfs },
  ];

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Services &amp; Active Sessions
            </Title>
          </FlexItem>
          <FlexItem>
            <Button variant="secondary" icon={<SyncAltIcon />} onClick={onRefresh}>
              Refresh status
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {/* System Services Cards */}
        <Grid hasGutter style={{ marginBottom: "2rem" }}>
          {serviceList.map((svc) => (
            <GridItem span={12} md={4} key={svc.id}>
              <Card isFullHeight>
                <CardTitle>
                  <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                    <FlexItem>
                      <ServerIcon style={{ marginRight: 8, color: "var(--pf-v5-global--primary-color--100)" }} />
                      {svc.name}
                    </FlexItem>
                    <FlexItem>
                      {svc.status.active ? (
                        <Label color="green" icon={<CheckCircleIcon />}>Running</Label>
                      ) : (
                        <Label color="red" icon={<ExclamationCircleIcon />}>Stopped</Label>
                      )}
                    </FlexItem>
                  </Flex>
                </CardTitle>
                <CardBody>
                  <div style={{ fontSize: "0.85rem", color: "var(--pf-v5-global--Color--200)", marginBottom: "1rem" }}>
                    Unit: <code>{svc.status.unit}</code> ({svc.status.enabled ? "enabled" : "disabled"})
                  </div>
                  <Flex gap={{ default: "gapSm" }}>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        icon={<RedoIcon />}
                        onClick={() => onServiceAction(svc.id, "restart")}
                      >
                        Restart
                      </Button>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="plain"
                        icon={<SyncAltIcon />}
                        onClick={() => onServiceAction(svc.id, "reload")}
                      >
                        Reload
                      </Button>
                    </FlexItem>
                  </Flex>
                </CardBody>
              </Card>
            </GridItem>
          ))}
        </Grid>

        {/* Connected Client Sessions */}
        <Card>
          <CardTitle>
            <Title headingLevel="h2" size="xl">Active Client Sessions ({sessions.length})</Title>
          </CardTitle>
          <CardBody style={{ padding: 0 }}>
            {sessions.length === 0 ? (
              <EmptyState style={{ padding: "3rem 1.5rem" }}>
                <EmptyStateHeader
                  titleText="No active client connections"
                  icon={<EmptyStateIcon icon={DesktopIcon} />}
                  headingLevel="h4"
                />
                <EmptyStateBody>
                  Connected client computers accessing Samba shares will automatically appear here.
                </EmptyStateBody>
              </EmptyState>
            ) : (
              <Table aria-label="Active Client Sessions Table">
                <Thead>
                  <Tr>
                    <Th sort={getSortParams(0)}>Service / Share</Th>
                    <Th sort={getSortParams(1)}>Username</Th>
                    <Th sort={getSortParams(2)}>Client Machine / IP</Th>
                    <Th sort={getSortParams(3)}>Process ID (PID)</Th>
                    <Th sort={getSortParams(4)}>Protocol Version</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedSessions.map((sess, idx) => (
                    <Tr key={`${sess.pid}-${sess.username}-${idx}`}>
                      <Td data-label="Service / Share">
                        <strong>[{sess.group || "IPC$"}]</strong>
                      </Td>
                      <Td data-label="Username">{sess.username}</Td>
                      <Td data-label="Client Machine / IP">
                        <code>{sess.machine}</code>
                      </Td>
                      <Td data-label="Process ID (PID)">
                        <Badge isRead>{sess.pid}</Badge>
                      </Td>
                      <Td data-label="Protocol Version">
                        <Label color="blue">{sess.protocol}</Label>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </PageSection>
    </>
  );
};

