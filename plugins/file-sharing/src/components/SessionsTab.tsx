import React from "react";
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
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
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
                      <ServerIcon style={{ marginRight: 8, color: "var(--zfs-tab-active-color)" }} />
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
                  <div style={{ fontSize: "0.85rem", color: "var(--zfs-text-secondary)", marginBottom: "1rem" }}>
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
                    <Th>Service / Share</Th>
                    <Th>Username</Th>
                    <Th>Client Machine / IP</Th>
                    <Th>Process ID (PID)</Th>
                    <Th>Protocol Version</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sessions.map((sess, idx) => (
                    <Tr key={idx}>
                      <Td data-label="Service / Share"><strong>[{sess.service}]</strong></Td>
                      <Td data-label="Username">{sess.username}</Td>
                      <Td data-label="Client Machine / IP">{sess.machine || sess.ip}</Td>
                      <Td data-label="PID"><code>{sess.pid}</code></Td>
                      <Td data-label="Protocol Version">
                        <Label color="cyan">{sess.protocol || "SMB3"}</Label>
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
