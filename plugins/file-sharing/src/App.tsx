import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Button,
  Flex,
  FlexItem,
  Page,
  PageSection,
  Spinner,
  Tabs,
  Tab,
  TabTitleText,
  Title
} from '@patternfly/react-core';
import {
  FolderIcon,
  GlobeIcon,
  UsersIcon,
  DesktopIcon,
  CogIcon,
  SyncAltIcon
} from '@patternfly/react-icons';
import { fileSharingApi } from './api/fileSharingClient';
import { FileSharingOverview, SmbGlobal, SmbShare } from './types';
import { SmbSharesTab } from './components/SmbSharesTab';
import { NfsExportsTab } from './components/NfsExportsTab';
import { UsersTab } from './components/UsersTab';
import { SessionsTab } from './components/SessionsTab';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'smb' | 'nfs' | 'users' | 'sessions'>('smb');
  const [data, setData] = useState<FileSharingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Array<{ key: number; title: string; variant: 'success' | 'danger' | 'warning' }>>([]);
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);

  // Ansible marker preferences
  const [ansibleBegin, setAnsibleBegin] = useState('# <-- BEGIN ANSIBLE MANAGED * CONFIG -->');
  const [ansibleEnd, setAnsibleEnd] = useState('# <-- END ANSIBLE MANAGED * CONFIG -->');

  const addAlert = (title: string, variant: 'success' | 'danger' | 'warning' = 'success') => {
    setAlerts((prev) => [...prev, { key: Date.now(), title, variant }]);
  };

  const loadData = useCallback(async () => {
    try {
      const overview = await fileSharingApi.getOverview(ansibleBegin, ansibleEnd);
      setData(overview);
    } catch (err: any) {
      addAlert(err.message || 'Failed to load file sharing data', 'danger');
    } finally {
      setLoading(false);
    }
  }, [ansibleBegin, ansibleEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSmbShare = async (share: Partial<SmbShare>) => {
    await fileSharingApi.saveSmbShare(share);
    addAlert(`Samba share [${share.name}] saved successfully`);
    await loadData();
  };

  const handleDeleteSmbShare = async (name: string) => {
    await fileSharingApi.deleteSmbShare(name);
    addAlert(`Samba share [${name}] deleted`);
    await loadData();
  };

  const handleSaveSmbGlobal = async (globalData: SmbGlobal) => {
    await fileSharingApi.saveSmbGlobal(globalData);
    addAlert('Samba global settings updated');
    await loadData();
  };

  const handleSaveNfsExport = async (exportData: { path: string; clients: any[] }) => {
    await fileSharingApi.saveNfsExport(exportData);
    addAlert(`NFS export for ${exportData.path} saved`);
    await loadData();
  };

  const handleDeleteNfsExport = async (path: string) => {
    await fileSharingApi.deleteNfsExport(path);
    addAlert(`NFS export for ${path} deleted`);
    await loadData();
  };

  const handleCreateUser = async (username: string, pass: string) => {
    await fileSharingApi.createSmbUser(username, pass);
    addAlert(`Samba user [${username}] created`);
    await loadData();
  };

  const handleSetUserPassword = async (username: string, pass: string) => {
    await fileSharingApi.setSmbUserPassword(username, pass);
    addAlert(`Password updated for user [${username}]`);
    await loadData();
  };

  const handleSetUserState = async (username: string, enable: boolean) => {
    await fileSharingApi.setSmbUserState(username, enable);
    addAlert(`User [${username}] ${enable ? 'enabled' : 'disabled'}`);
    await loadData();
  };

  const handleDeleteUser = async (username: string) => {
    await fileSharingApi.deleteSmbUser(username);
    addAlert(`User [${username}] removed from Samba`);
    await loadData();
  };

  const handleServiceAction = async (service: string, verb: 'restart' | 'reload') => {
    await fileSharingApi.serviceAction(service, verb);
    addAlert(`Service ${service} ${verb}ed`);
    await loadData();
  };

  if (loading && !data) {
    return (
      <Page>
        <PageSection style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <Spinner size="xl" />
          <div style={{ marginTop: '1rem', color: 'var(--pf-v5-global--Color--200)' }}>
            Loading File Sharing Services & Shares...
          </div>
        </PageSection>
      </Page>
    );
  }

  return (
    <Page>
      <AlertGroup isToast isLiveRegion>
        {alerts.map((a) => (
          <Alert
            key={a.key}
            variant={a.variant}
            title={a.title}
            actionClose={<AlertActionCloseButton onClose={() => setAlerts((prev) => prev.filter((item) => item.key !== a.key))} />}
            timeout={5000}
          />
        ))}
      </AlertGroup>

      <PageSection variant="light" style={{ paddingBottom: 0 }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl">
              File Sharing
            </Title>
            <p style={{ color: 'var(--pf-v5-global--Color--200)', marginTop: 4 }}>
              Manage SMB (Samba) shares, NFS exports, user accounts, and ZFS integration.
            </p>
          </FlexItem>
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              <Button variant="secondary" icon={<SyncAltIcon />} onClick={loadData}>
                Refresh
              </Button>
              <Button variant="primary" icon={<CogIcon />} onClick={() => setIsGlobalModalOpen(true)}>
                Samba Settings
              </Button>
            </Flex>
          </FlexItem>
        </Flex>

        <Tabs
          activeKey={activeTab}
          onSelect={(_e, tabKey) => setActiveTab(tabKey as any)}
          style={{ marginTop: '1.5rem' }}
        >
          <Tab
            eventKey="smb"
            title={<TabTitleText><FolderIcon style={{ marginRight: 6 }} />SMB Shares ({data?.smb.shares.length || 0})</TabTitleText>}
          />
          <Tab
            eventKey="nfs"
            title={<TabTitleText><GlobeIcon style={{ marginRight: 6 }} />NFS Exports ({data?.nfs.exports.length || 0})</TabTitleText>}
          />
          <Tab
            eventKey="users"
            title={<TabTitleText><UsersIcon style={{ marginRight: 6 }} />Samba Users & Permissions ({data?.users.smb_users.length || 0})</TabTitleText>}
          />
          <Tab
            eventKey="sessions"
            title={<TabTitleText><DesktopIcon style={{ marginRight: 6 }} />Services & Sessions ({data?.sessions.length || 0})</TabTitleText>}
          />
        </Tabs>
      </PageSection>

      <PageSection>
        {activeTab === 'smb' && data && (
          <SmbSharesTab
            shares={data.smb.shares}
            zfsMounts={data.zfs_mounts}
            onSaveShare={handleSaveSmbShare}
            onDeleteShare={handleDeleteSmbShare}
          />
        )}

        {activeTab === 'nfs' && data && (
          <NfsExportsTab
            exports={data.nfs.exports}
            clientMap={data.nfs.client_map}
            zfsMounts={data.zfs_mounts}
            onSaveExport={handleSaveNfsExport}
            onDeleteExport={handleDeleteNfsExport}
          />
        )}

        {activeTab === 'users' && data && (
          <UsersTab
            users={data.users.smb_users}
            unixUsers={data.users.unix_users}
            accessMatrix={data.users.access_matrix}
            onCreateUser={handleCreateUser}
            onSetPassword={handleSetUserPassword}
            onSetState={handleSetUserState}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {activeTab === 'sessions' && data && (
          <SessionsTab
            services={data.services}
            sessions={data.sessions}
            onServiceAction={handleServiceAction}
            onRefresh={loadData}
          />
        )}
      </PageSection>

      {data && (
        <GlobalSettingsModal
          isOpen={isGlobalModalOpen}
          globalConfig={data.smb.global}
          ansibleBegin={ansibleBegin}
          ansibleEnd={ansibleEnd}
          onClose={() => setIsGlobalModalOpen(false)}
          onSaveGlobal={handleSaveSmbGlobal}
          onUpdateAnsibleMarkers={(b, e) => {
            setAnsibleBegin(b);
            setAnsibleEnd(e);
          }}
        />
      )}
    </Page>
  );
};
