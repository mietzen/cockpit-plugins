import React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  Label
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import {
  SyncAltIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  RedoIcon,
  ServerIcon,
  DesktopIcon
} from '@patternfly/react-icons';
import { ServiceStatus, SmbSession } from '../types';

interface SessionsTabProps {
  services: {
    smbd: ServiceStatus;
    nmbd: ServiceStatus;
    nfs: ServiceStatus;
  };
  sessions: SmbSession[];
  onServiceAction: (service: string, verb: 'restart' | 'reload') => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  services,
  sessions,
  onServiceAction,
  onRefresh
}) => {
  const serviceList = [
    { name: 'Samba File Daemon (smbd)', id: 'smbd', status: services.smbd },
    { name: 'NetBIOS Name Daemon (nmbd)', id: 'nmbd', status: services.nmbd },
    { name: 'NFS Kernel Server', id: 'nfs', status: services.nfs }
  ];

  return (
    <>
      <Grid hasGutter style={{ marginBottom: '1.5rem' }}>
        {serviceList.map((svc) => (
          <GridItem span={4} key={svc.id}>
            <Card isCompact>
              <CardHeader>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} style={{ width: '100%' }}>
                  <FlexItem>
                    <CardTitle style={{ fontSize: '0.95rem' }}>
                      <ServerIcon style={{ marginRight: 6 }} />
                      {svc.name}
                    </CardTitle>
                  </FlexItem>
                  <FlexItem>
                    {svc.status.active ? (
                      <Label color="green" icon={<CheckCircleIcon />}>Running</Label>
                    ) : (
                      <Label color="red" icon={<ExclamationCircleIcon />}>Stopped</Label>
                    )}
                  </FlexItem>
                </Flex>
              </CardHeader>
              <CardBody>
                <div style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginBottom: 12 }}>
                  Unit: <code>{svc.status.unit}</code> ({svc.status.enabled ? 'enabled' : 'disabled'})
                </div>
                <Flex spaceItems={{ default: 'spaceItemsSm' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RedoIcon />}
                    onClick={() => onServiceAction(svc.id, 'restart')}
                  >
                    Restart
                  </Button>
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={<SyncAltIcon />}
                    onClick={() => onServiceAction(svc.id, 'reload')}
                  >
                    Reload
                  </Button>
                </Flex>
              </CardBody>
            </Card>
          </GridItem>
        ))}
      </Grid>

      <Card>
        <CardHeader>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} style={{ width: '100%' }}>
            <FlexItem>
              <CardTitle>
                <DesktopIcon style={{ marginRight: 8 }} />
                Active SMB Client Sessions ({sessions.length})
              </CardTitle>
            </FlexItem>
            <FlexItem>
              <Button variant="secondary" icon={<SyncAltIcon />} onClick={onRefresh}>
                Refresh Sessions
              </Button>
            </FlexItem>
          </Flex>
        </CardHeader>
        <CardBody>
          <Table aria-label="SMB Sessions Table" variant="compact">
            <Thead>
              <Tr>
                <Th>Process ID (PID)</Th>
                <Th>User</Th>
                <Th>Group</Th>
                <Th>Client Machine / IP</Th>
                <Th>Protocol</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sessions.map((s) => (
                <Tr key={s.pid}>
                  <Td dataLabel="PID">
                    <code>{s.pid}</code>
                  </Td>
                  <Td dataLabel="User">
                    <strong>{s.username}</strong>
                  </Td>
                  <Td dataLabel="Group">{s.group}</Td>
                  <Td dataLabel="Client Machine">
                    <Label color="blue">{s.machine}</Label>
                  </Td>
                  <Td dataLabel="Protocol">
                    <Label color="grey">{s.protocol}</Label>
                  </Td>
                </Tr>
              ))}
              {sessions.length === 0 && (
                <Tr>
                  <Td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    No active SMB client connections detected.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
    </>
  );
};
