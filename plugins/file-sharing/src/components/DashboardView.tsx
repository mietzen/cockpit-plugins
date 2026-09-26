import React, { useState } from "react";
import {
  PageSection,
  Card,
  CardTitle,
  CardBody,
  Grid,
  GridItem,
  Button,
  Flex,
  FlexItem,
  Title,
  Label,
  Divider,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from "@patternfly/react-table";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusCircleIcon,
  FolderOpenIcon,
  UsersIcon,
  ServerIcon,
  ArrowRightIcon,
  LockIcon,
  AppleIcon,
} from "@patternfly/react-icons";
import { FileSharingOverview, SmbShare, NfsExport, SmbSession } from "../types";

interface DashboardViewProps {
  overview: FileSharingOverview;
  onNavigate: (view: string) => void;
  onCreateSmbShare: () => void;
  onCreateNfsExport: () => void;
  onAddUser: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  overview,
  onNavigate,
  onCreateSmbShare,
  onCreateNfsExport,
  onAddUser,
}) => {
  const smbServices = [overview.services.smbd, overview.services.nmbd];
  const nfsServices = [overview.services.nfs];
  const allServicesActive = [...smbServices, ...nfsServices].every((s) => s.active);

  const smbShares = overview.smb.shares;
  const nfsExports = overview.nfs.exports;
  const users = overview.users.smb_users;
  const sessions = overview.sessions;

  const managedSmbCount = smbShares.filter((s) => s.is_managed).length;
  const managedNfsCount = nfsExports.filter((e) => e.is_managed).length;

  const [sessSortIndex, setSessSortIndex] = useState<number | null>(0);
  const [sessSortDirection, setSessSortDirection] = useState<'asc' | 'desc'>('asc');

  const [shareSortIndex, setShareSortIndex] = useState<number | null>(0);
  const [shareSortDirection, setShareSortDirection] = useState<'asc' | 'desc'>('asc');

  const getSessSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: sessSortIndex ?? undefined,
      direction: sessSortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setSessSortIndex(index);
      setSessSortDirection(direction);
    },
    columnIndex,
  });

  const getShareSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: shareSortIndex ?? undefined,
      direction: shareSortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setShareSortIndex(index);
      setShareSortDirection(direction);
    },
    columnIndex,
  });

  const sortedShares = React.useMemo(() => {
    if (shareSortIndex === null) {
      return smbShares;
    }
    return [...smbShares].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (shareSortIndex === 0) {
        aVal = a.name;
        bVal = b.name;
      } else if (shareSortIndex === 1) {
        aVal = a.path || '';
        bVal = b.path || '';
      } else if (shareSortIndex === 2) {
        aVal = a.read_only ? 'Read-Only' : 'Read/Write';
        bVal = b.read_only ? 'Read-Only' : 'Read/Write';
      } else if (shareSortIndex === 3) {
        aVal = a.guest_ok ? 'Allowed' : 'No';
        bVal = b.guest_ok ? 'Allowed' : 'No';
      }
      return shareSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [smbShares, shareSortIndex, shareSortDirection]);

  const sortedSessions = React.useMemo(() => {
    if (sessSortIndex === null) {
      return sessions;
    }
    return [...sessions].sort((a: any, b: any) => {
      let aVal = '';
      let bVal = '';
      if (sessSortIndex === 0) {
        aVal = a.service || a.group || '';
        bVal = b.service || b.group || '';
      } else if (sessSortIndex === 1) {
        aVal = a.username || '';
        bVal = b.username || '';
      } else if (sessSortIndex === 2) {
        aVal = a.machine || a.ip || '';
        bVal = b.machine || b.ip || '';
      } else if (sessSortIndex === 3) {
        const aPid = parseInt(String(a.pid || '0'), 10) || 0;
        const bPid = parseInt(String(b.pid || '0'), 10) || 0;
        return sessSortDirection === 'asc' ? aPid - bPid : bPid - aPid;
      } else if (sessSortIndex === 4) {
        aVal = a.protocol || '';
        bVal = b.protocol || '';
      }
      return sessSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [sessions, sessSortIndex, sessSortDirection]);

  return (
    <>
      {/* Top Header */}
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              File Sharing
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={onCreateSmbShare}>
                  Create SMB share
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<PlusCircleIcon />} onClick={onCreateNfsExport}>
                  Create NFS export
                </Button>
              </FlexItem>
              <FlexItem>
                <Button variant="secondary" icon={<UsersIcon />} onClick={onAddUser}>
                  Add SMB User
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {/* 4 Overview Metric Cards */}
        <Grid hasGutter style={{ marginBottom: "2rem" }}>
          {/* Card 1: Services Health */}
          <GridItem span={12} sm={6} md={3}>
            <Card isFullHeight>
              <CardTitle>Services health</CardTitle>
              <CardBody>
                <Flex alignItems={{ default: "alignItemsCenter" }} style={{ marginBottom: "0.75rem" }}>
                  <FlexItem>
                    {allServicesActive ? (
                      <CheckCircleIcon style={{ color: "var(--pf-v5-global--success-color--100)", fontSize: "1.5rem" }} />
                    ) : (
                      <ExclamationTriangleIcon style={{ color: "var(--pf-v5-global--warning-color--100)", fontSize: "1.5rem" }} />
                    )}
                  </FlexItem>
                  <FlexItem>
                    <Title headingLevel="h3" size="lg">
                      {allServicesActive ? "All services active" : "Service attention required"}
                    </Title>
                  </FlexItem>
                </Flex>
                <div style={{ color: "var(--zfs-text-secondary)", fontSize: "0.875rem" }}>
                  smbd: {overview.services.smbd.active ? "running" : "stopped"} · nfs: {overview.services.nfs.active ? "running" : "stopped"}
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 2: SMB Shares */}
          <GridItem span={12} sm={6} md={3}>
            <Card isFullHeight>
              <CardTitle>SMB Shares</CardTitle>
              <CardBody>
                <div className="cockpit-metric-val">{smbShares.length}</div>
                <div className="cockpit-metric-label">
                  {managedSmbCount > 0 ? `${managedSmbCount} Ansible managed` : "Standard shares"}
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 3: NFS Exports */}
          <GridItem span={12} sm={6} md={3}>
            <Card isFullHeight>
              <CardTitle>NFS Exports</CardTitle>
              <CardBody>
                <div className="cockpit-metric-val">{nfsExports.length}</div>
                <div className="cockpit-metric-label">
                  {overview.nfs.client_map.length} client subnets configured
                </div>
              </CardBody>
            </Card>
          </GridItem>

          {/* Card 4: Samba Users & Sessions */}
          <GridItem span={12} sm={6} md={3}>
            <Card isFullHeight>
              <CardTitle>Users &amp; Sessions</CardTitle>
              <CardBody>
                <div className="cockpit-metric-val">{users.length}</div>
                <div className="cockpit-metric-label">
                  {sessions.length} active client connection(s)
                </div>
              </CardBody>
            </Card>
          </GridItem>
        </Grid>

        {/* Active Shares Overview Table */}
        <Card style={{ marginBottom: "2rem" }}>
          <CardTitle>
            <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
              <FlexItem>
                <Title headingLevel="h2" size="xl">Active SMB Shares</Title>
              </FlexItem>
              <FlexItem>
                <Button variant="link" icon={<ArrowRightIcon />} onClick={() => onNavigate("smb")}>
                  View all shares
                </Button>
              </FlexItem>
            </Flex>
          </CardTitle>
          <CardBody style={{ padding: 0 }}>
            <Table aria-label="Active SMB Shares Table">
              <Thead>
                <Tr>
                  <Th sort={getShareSortParams(0)}>Share name</Th>
                  <Th sort={getShareSortParams(1)}>Path</Th>
                  <Th sort={getShareSortParams(2)}>Access</Th>
                  <Th sort={getShareSortParams(3)}>Guest access</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sortedShares.slice(0, 5).map((share) => {
                  const isFruit = Boolean(
                    share.fruit_time_machine ||
                    (share.vfs_objects || "").includes("fruit") ||
                    share.name.toLowerCase().includes("time-machine") ||
                    share.name.toLowerCase().includes("timemachine") ||
                    Object.keys(share.raw_params || {}).some((k) => k.toLowerCase().includes("fruit"))
                  );
                  return (
                    <Tr key={share.name}>
                      <Td data-label="Share name">
                        <strong>[{share.name}]</strong>
                        {share.is_managed && (
                          <Label color="blue" icon={<LockIcon />} style={{ marginLeft: "0.5rem" }}>
                            {share.managed_by || "managed"}
                          </Label>
                        )}
                        {isFruit && (
                          <Label color="grey" icon={<AppleIcon />} style={{ marginLeft: "0.5rem" }}>
                            Time Machine
                          </Label>
                        )}
                      </Td>
                      <Td data-label="Path">{share.name === "homes" && share.path?.includes("%S") ? share.path.replace("%S", "$USER") : (share.path || "—")}</Td>
                      <Td data-label="Access">
                        <Label color={share.read_only ? "blue" : "green"}>
                          {share.read_only ? "Read-Only" : "Read/Write"}
                        </Label>
                      </Td>
                      <Td data-label="Guest access">{share.guest_ok ? "Allowed" : "No"}</Td>
                      <Td data-label="Status">
                        <Label color="green" icon={<CheckCircleIcon />}>Active</Label>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </CardBody>
        </Card>

        {/* Connected Sessions Table */}
        <Card>
          <CardTitle>
            <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
              <FlexItem>
                <Title headingLevel="h2" size="xl">Active Client Sessions</Title>
              </FlexItem>
              <FlexItem>
                <Button variant="link" icon={<ArrowRightIcon />} onClick={() => onNavigate("sessions")}>
                  Manage services &amp; sessions
                </Button>
              </FlexItem>
            </Flex>
          </CardTitle>
          <CardBody style={{ padding: 0 }}>
            {sessions.length === 0 ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--zfs-text-secondary)" }}>
                No active client connections currently established.
              </div>
            ) : (
              <Table aria-label="Active Client Sessions Table">
                <Thead>
                  <Tr>
                    <Th sort={getSessSortParams(0)}>Service / Share</Th>
                    <Th sort={getSessSortParams(1)}>Username</Th>
                    <Th sort={getSessSortParams(2)}>Client Machine / IP</Th>
                    <Th sort={getSessSortParams(3)}>PID</Th>
                    <Th sort={getSessSortParams(4)}>Protocol</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {sortedSessions.map((sess: any, idx: number) => (
                    <Tr key={idx}>
                      <Td data-label="Service / Share"><strong>{sess.service || sess.group || "SMB"}</strong></Td>
                      <Td data-label="Username">{sess.username}</Td>
                      <Td data-label="Client Machine / IP">{sess.machine || sess.ip || "—"}</Td>
                      <Td data-label="PID">{sess.pid}</Td>
                      <Td data-label="Protocol">{sess.protocol || "SMB3"}</Td>
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
