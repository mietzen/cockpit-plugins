import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Tab,
  TabTitleText,
  Badge,
  Alert,
  EmptyState,
  EmptyStateBody,
  Title,
  Button,
} from '@patternfly/react-core';
import { useCockpitTheme, ConfirmModal } from '@cockpit-plugins/common';
import '@cockpit-plugins/common/src/styles/cockpit-theme.css';

import {
  ContainerOverview,
  ContainerItem,
  ImageItem,
  VolumeItem,
  NetworkItem,
  EngineType,
} from './types';
import {
  containerApi,
  DEFAULT_MOCK_OVERVIEW,
  DEFAULT_EMPTY_OVERVIEW,
} from './api/containerClient';

import { Header } from './components/Header';
import { ContainersTab } from './components/ContainersTab';
import { ImagesTab } from './components/ImagesTab';
import { VolumesTab } from './components/VolumesTab';
import { NetworksTab } from './components/NetworksTab';
import { ContainerTerminalModal } from './components/ContainerTerminalModal';
import { ContainerLogsModal } from './components/ContainerLogsModal';
import { SystemPruneModal } from './components/SystemPruneModal';
import { RemoteApiModal } from './components/RemoteApiModal';

export const App: React.FC = () => {
  const isDark = useCockpitTheme();

  const [overview, setOverview] = useState<ContainerOverview>(
    typeof window !== 'undefined' && window.cockpit ? DEFAULT_EMPTY_OVERVIEW : DEFAULT_MOCK_OVERVIEW
  );
  const [activeEngine, setActiveEngine] = useState<EngineType>('auto');
  const [activeTab, setActiveTab] = useState<string>('containers');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Modals state
  const [terminalContainer, setTerminalContainer] = useState<ContainerItem | null>(null);
  const [logsContainer, setLogsContainer] = useState<ContainerItem | null>(null);
  const [systemPruneOpen, setSystemPruneOpen] = useState<boolean>(false);
  const [remoteApiOpen, setRemoteApiOpen] = useState<boolean>(false);

  // Generic Confirm Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    confirmVariant?: 'danger' | 'primary' | 'warning';
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {},
  });

  const loadData = async (engineToUse?: EngineType) => {
    setIsLoading(true);
    setBannerError(null);
    try {
      const data = await containerApi.getOverview(engineToUse);
      setOverview(data);
      if (data.active_engine && data.active_engine !== 'none') {
        setActiveEngine(data.active_engine);
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to load container engine overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectEngine = (newEngine: EngineType) => {
    setActiveEngine(newEngine);
    loadData(newEngine);
  };

  const handleContainerAction = async (
    id: string,
    action: 'start' | 'stop' | 'kill' | 'restart'
  ) => {
    setIsLoading(true);
    try {
      const res = await containerApi.containerAction(id, action, activeEngine);
      if (res?.status === 'error') {
        setBannerError(res.error || `Failed to ${action} container`);
      } else {
        await loadData();
      }
    } catch (err: any) {
      setBannerError(err?.message || `Failed to ${action} container`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteContainer = (c: ContainerItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Container: ${c.name}`,
      message: (
        <p>
          Are you sure you want to permanently delete container <strong>{c.name}</strong> ({c.shortId})?
        </p>
      ),
      confirmText: 'Delete Container',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await containerApi.deleteEntity('container', c.id, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete container');
          } else {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            await loadData();
          }
        } catch (e: any) {
          setBannerError(e?.message || 'Failed to delete container');
        }
      },
    });
  };

  const handleDeleteImage = (img: ImageItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Image: ${img.repository}:${img.tag}`,
      message: (
        <p>
          Are you sure you want to remove image <strong>{img.repository}:{img.tag}</strong> ({img.shortId})?
        </p>
      ),
      confirmText: 'Delete Image',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await containerApi.deleteEntity('image', img.id, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete image');
          } else {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            await loadData();
          }
        } catch (e: any) {
          setBannerError(e?.message || 'Failed to delete image');
        }
      },
    });
  };

  const handleDeleteVolume = (vol: VolumeItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Volume: ${vol.name}`,
      message: (
        <p>
          Are you sure you want to permanently delete volume <strong>{vol.name}</strong>?
          All persistent data in this volume will be lost.
        </p>
      ),
      confirmText: 'Delete Volume',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await containerApi.deleteEntity('volume', vol.name, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete volume');
          } else {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            await loadData();
          }
        } catch (e: any) {
          setBannerError(e?.message || 'Failed to delete volume');
        }
      },
    });
  };

  const handleDeleteNetwork = (net: NetworkItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Network: ${net.name}`,
      message: (
        <p>
          Are you sure you want to remove network <strong>{net.name}</strong>?
        </p>
      ),
      confirmText: 'Delete Network',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await containerApi.deleteEntity('network', net.id || net.name, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete network');
          } else {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            await loadData();
          }
        } catch (e: any) {
          setBannerError(e?.message || 'Failed to delete network');
        }
      },
    });
  };

  const handlePruneEntity = (kind: 'container' | 'image' | 'volume' | 'network', title: string) => {
    setConfirmModal({
      isOpen: true,
      title,
      message: <p>Are you sure you want to purge all unused {kind}s from the {activeEngine} engine?</p>,
      confirmText: `Prune ${kind}s`,
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await containerApi.prune(kind, kind === 'image', false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || `Failed to prune ${kind}s`);
          } else {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            await loadData();
          }
        } catch (e: any) {
          setBannerError(e?.message || `Failed to prune ${kind}s`);
        }
      },
    });
  };

  const handleSystemPrune = async (includeVolumes: boolean) => {
    setIsLoading(true);
    try {
      const res = await containerApi.prune('system', false, includeVolumes, activeEngine);
      if (res?.status === 'error') {
        setBannerError(res.error || 'System prune failed');
      } else {
        setSystemPruneOpen(false);
        await loadData();
      }
    } catch (e: any) {
      setBannerError(e?.message || 'System prune failed');
    } finally {
      setIsLoading(false);
    }
  };

  const isNoneInstalled =
    !overview.engines.docker.installed && !overview.engines.podman.installed;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--pf-v5-global--BackgroundColor--100, #0d1117)' }}>
      <Header
        engines={overview.engines}
        activeEngine={activeEngine}
        onSelectEngine={handleSelectEngine}
        onRefresh={() => loadData()}
        onOpenSystemPrune={() => setSystemPruneOpen(true)}
        onOpenRemoteApi={() => setRemoteApiOpen(true)}
        isLoading={isLoading}
      />

      {bannerError && (
        <Alert
          variant="danger"
          isInline
          title="Error"
          actionClose={<Button variant="plain" onClick={() => setBannerError(null)}>×</Button>}
          style={{ margin: '1rem 1.5rem 0 1.5rem' }}
        >
          {bannerError}
        </Alert>
      )}

      {isNoneInstalled ? (
        <div style={{ padding: '3rem 1.5rem' }}>
          <EmptyState>
            <Title headingLevel="h2" size="xl">
              No Container Engine Found
            </Title>
            <EmptyStateBody>
              Neither <strong>Docker</strong> nor <strong>Podman</strong> is installed on this host.
              Please install one of the container engines to manage containers through Cockpit:
            </EmptyStateBody>
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#161b22',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                textAlign: 'left',
                maxWidth: '600px',
              }}
            >
              # Install Podman (Recommended on RHEL/Fedora/Debian)<br />
              sudo apt-get install -y podman || sudo dnf install -y podman<br /><br />
              # Or install Docker Engine<br />
              sudo apt-get install -y docker.io || sudo dnf install -y docker-ce
            </div>
            <Button variant="primary" style={{ marginTop: '1.5rem' }} onClick={() => loadData()}>
              Re-check Installed Engines
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div>
          <Tabs
            activeKey={activeTab}
            onSelect={(_e, key) => setActiveTab(String(key))}
            isBox
            style={{ padding: '0 1.5rem', marginTop: '0.5rem' }}
          >
            <Tab
              eventKey="containers"
              title={
                <TabTitleText>
                  Containers <Badge isRead>{overview.containers.length}</Badge>
                </TabTitleText>
              }
            />
            <Tab
              eventKey="images"
              title={
                <TabTitleText>
                  Images <Badge isRead>{overview.images.length}</Badge>
                </TabTitleText>
              }
            />
            <Tab
              eventKey="volumes"
              title={
                <TabTitleText>
                  Volumes <Badge isRead>{overview.volumes.length}</Badge>
                </TabTitleText>
              }
            />
            <Tab
              eventKey="networks"
              title={
                <TabTitleText>
                  Networks <Badge isRead>{overview.networks.length}</Badge>
                </TabTitleText>
              }
            />
          </Tabs>

          {/* Persistent in-memory views to avoid layout thrashing and 0ms redraw */}
          <div style={{ display: activeTab === 'containers' ? 'block' : 'none' }}>
            <ContainersTab
              containers={overview.containers}
              onAction={handleContainerAction}
              onDelete={handleDeleteContainer}
              onOpenTerminal={(c) => setTerminalContainer(c)}
              onOpenLogs={(c) => setLogsContainer(c)}
              onPruneStopped={() => handlePruneEntity('container', 'Prune Stopped Containers')}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeTab === 'images' ? 'block' : 'none' }}>
            <ImagesTab
              images={overview.images}
              onDelete={handleDeleteImage}
              onPruneUnused={() => handlePruneEntity('image', 'Prune Unused Images')}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeTab === 'volumes' ? 'block' : 'none' }}>
            <VolumesTab
              volumes={overview.volumes}
              onDelete={handleDeleteVolume}
              onPruneUnused={() => handlePruneEntity('volume', 'Prune Unused Volumes')}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeTab === 'networks' ? 'block' : 'none' }}>
            <NetworksTab
              networks={overview.networks}
              onDelete={handleDeleteNetwork}
              onPruneUnused={() => handlePruneEntity('network', 'Prune Unused Networks')}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Terminal Modal */}
      <ContainerTerminalModal
        isOpen={Boolean(terminalContainer)}
        container={terminalContainer}
        activeEngine={activeEngine}
        isDark={isDark}
        onClose={() => setTerminalContainer(null)}
      />

      {/* Logs Modal */}
      <ContainerLogsModal
        isOpen={Boolean(logsContainer)}
        container={logsContainer}
        activeEngine={activeEngine}
        isDark={isDark}
        onClose={() => setLogsContainer(null)}
      />

      {/* System Prune Modal */}
      <SystemPruneModal
        isOpen={systemPruneOpen}
        activeEngine={activeEngine}
        onPrune={handleSystemPrune}
        onClose={() => setSystemPruneOpen(false)}
        isLoading={isLoading}
      />

      {/* Remote API & TLS Modal */}
      <RemoteApiModal
        isOpen={remoteApiOpen}
        activeEngine={activeEngine}
        onClose={() => setRemoteApiOpen(false)}
      />

      {/* Generic Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.confirmVariant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
