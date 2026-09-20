import React, { useState, useEffect, useCallback } from 'react';
import '@patternfly/react-core/dist/styles/base.css';
import '@cockpit-plugins/common/src/styles/cockpit-theme.css';
import {
  Alert,
  EmptyState,
  EmptyStateBody,
  Title,
  Button,
  Page,
} from '@patternfly/react-core';
import { useCockpitTheme, ConfirmModal } from '@cockpit-plugins/common';

import {
  ContainerOverview,
  ContainerItem,
  ImageItem,
  VolumeItem,
  NetworkItem,
  EngineType,
  TlsStatus,
} from './types';
import {
  containerApi,
  DEFAULT_MOCK_OVERVIEW,
  DEFAULT_EMPTY_OVERVIEW,
} from './api/containerClient';

import { Navigation } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { ContainersTab } from './components/ContainersTab';
import { ImagesTab } from './components/ImagesTab';
import { VolumesTab } from './components/VolumesTab';
import { NetworksTab } from './components/NetworksTab';
import { SettingsView } from './components/SettingsView';
import { InspectModal } from './components/InspectModal';
import { ContainerTerminalModal } from './components/ContainerTerminalModal';
import { ContainerLogsModal } from './components/ContainerLogsModal';
import { SystemPruneModal } from './components/SystemPruneModal';

export const App: React.FC = () => {
  const isDark = useCockpitTheme();

  const [overview, setOverview] = useState<ContainerOverview>(
    typeof window !== 'undefined' && window.cockpit ? DEFAULT_EMPTY_OVERVIEW : DEFAULT_MOCK_OVERVIEW
  );
  const [tlsStatus, setTlsStatus] = useState<TlsStatus | null>(null);
  const [activeEngine, setActiveEngine] = useState<EngineType>(() => {
    try {
      const saved = localStorage.getItem('cockpit_container_engine');
      if (saved === 'docker' || saved === 'podman') return saved as EngineType;
    } catch {}
    return 'auto';
  });
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Modals state
  const [terminalContainer, setTerminalContainer] = useState<ContainerItem | null>(null);
  const [logsContainer, setLogsContainer] = useState<ContainerItem | null>(null);
  const [systemPruneOpen, setSystemPruneOpen] = useState<boolean>(false);

  // Inspect modal state
  const [inspectModalState, setInspectModalState] = useState<{
    isOpen: boolean;
    kind: 'container' | 'image' | 'volume' | 'network';
    id: string;
    name?: string;
  }>({
    isOpen: false,
    kind: 'container',
    id: '',
    name: '',
  });

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

  const loadData = useCallback(async (engineToUse?: EngineType) => {
    setIsLoading(true);
    setBannerError(null);
    try {
      let preferred = engineToUse;
      if (!preferred || preferred === 'auto') {
        try {
          const saved = localStorage.getItem('cockpit_container_engine');
          if (saved === 'docker' || saved === 'podman') preferred = saved as EngineType;
        } catch {}
      }

      const data = await containerApi.getOverview(preferred);
      setOverview(data);

      const effEngine = (preferred && preferred !== 'auto')
        ? preferred
        : (data.active_engine && data.active_engine !== 'none' ? data.active_engine : 'docker');
      setActiveEngine(effEngine);

      const tls = await containerApi.getTlsStatus(effEngine).catch(() => null);
      setTlsStatus(tls);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to load container engine overview');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectEngine = (newEngine: EngineType) => {
    try {
      localStorage.setItem('cockpit_container_engine', newEngine);
    } catch {}
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
        await loadData(activeEngine);
      }
    } catch (err: any) {
      setBannerError(err?.message || `Failed to ${action} container`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteContainer = (container: ContainerItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Container: ${container.name}`,
      message: (
        <div>
          Are you sure you want to permanently delete container <strong>{container.name}</strong> (<code>{container.shortId}</code>)?
        </div>
      ),
      confirmText: 'Delete Container',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await containerApi.deleteEntity('container', container.id, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete container');
          } else {
            await loadData(activeEngine);
          }
        } catch (err: any) {
          setBannerError(err?.message || 'Failed to delete container');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleDeleteImage = (image: ImageItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Image: ${image.repository}:${image.tag}`,
      message: (
        <div>
          Are you sure you want to delete image <strong>{image.repository}:{image.tag}</strong> (<code>{image.shortId}</code>)?
        </div>
      ),
      confirmText: 'Delete Image',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await containerApi.deleteEntity('image', image.id, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete image');
          } else {
            await loadData(activeEngine);
          }
        } catch (err: any) {
          setBannerError(err?.message || 'Failed to delete image');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleDeleteVolume = (volume: VolumeItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Volume: ${volume.name}`,
      message: (
        <div>
          Are you sure you want to permanently delete volume <strong>{volume.name}</strong>? All stored data in this volume will be lost.
        </div>
      ),
      confirmText: 'Delete Volume',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await containerApi.deleteEntity('volume', volume.name, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete volume');
          } else {
            await loadData(activeEngine);
          }
        } catch (err: any) {
          setBannerError(err?.message || 'Failed to delete volume');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleDeleteNetwork = (network: NetworkItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Network: ${network.name}`,
      message: (
        <div>
          Are you sure you want to delete network <strong>{network.name}</strong> (<code>{network.shortId}</code>)?
        </div>
      ),
      confirmText: 'Delete Network',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await containerApi.deleteEntity('network', network.id, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || 'Failed to delete network');
          } else {
            await loadData(activeEngine);
          }
        } catch (err: any) {
          setBannerError(err?.message || 'Failed to delete network');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handlePruneEntity = (kind: 'container' | 'image' | 'volume' | 'network', title: string) => {
    setConfirmModal({
      isOpen: true,
      title,
      message: (
        <div>
          Are you sure you want to prune all unused <strong>{kind}s</strong>? This action will remove all {kind}s not currently in use.
        </div>
      ),
      confirmText: `Prune ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`,
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await containerApi.prune(kind, true, false, activeEngine);
          if (res?.status === 'error') {
            setBannerError(res.error || `Failed to prune ${kind}s`);
          } else {
            await loadData(activeEngine);
          }
        } catch (err: any) {
          setBannerError(err?.message || `Failed to prune ${kind}s`);
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleSystemPrune = async (volumes: boolean) => {
    setIsLoading(true);
    try {
      const res = await containerApi.prune('system', true, volumes, activeEngine);
      if (res?.status === 'error') {
        setBannerError(res.error || 'Failed to perform system prune');
      } else {
        await loadData(activeEngine);
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to perform system prune');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInspect = (
    kind: 'container' | 'image' | 'volume' | 'network',
    id: string,
    name?: string
  ) => {
    setInspectModalState({
      isOpen: true,
      kind,
      id,
      name,
    });
  };

  const isNoneInstalled = !overview.engines.docker.installed && !overview.engines.podman.installed;

  return (
    <Page style={{ minHeight: '100vh', backgroundColor: 'var(--zfs-canvas-bg)' }}>
      {/* Top Sticky Navigation Bar */}
      <Navigation
        activeView={activeView}
        onSelectView={(v) => setActiveView(v)}
        onRefresh={() => loadData(activeEngine)}
        isLoading={isLoading}
        containerCount={overview.containers.length}
        imageCount={overview.images.length}
        volumeCount={overview.volumes.length}
        networkCount={overview.networks.length}
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
                backgroundColor: 'var(--pf-v5-global--BackgroundColor--200, #161b22)',
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
            <Button variant="primary" style={{ marginTop: '1.5rem' }} onClick={() => loadData(activeEngine)}>
              Re-check Installed Engines
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div>
          {/* Persistent in-memory views to avoid layout thrashing and 0ms redraw */}
          <div style={{ display: activeView === 'dashboard' ? 'block' : 'none' }}>
            <DashboardView
              containers={overview.containers}
              images={overview.images}
              volumes={overview.volumes}
              networks={overview.networks}
              tlsStatus={tlsStatus}
              onNavigateTab={(tab) => setActiveView(tab)}
              onAction={handleContainerAction}
              onOpenTerminal={(c) => setTerminalContainer(c)}
              onOpenLogs={(c) => setLogsContainer(c)}
              onOpenInspect={handleOpenInspect}
            />
          </div>

          <div style={{ display: activeView === 'containers' ? 'block' : 'none' }}>
            <ContainersTab
              containers={overview.containers}
              onAction={handleContainerAction}
              onDelete={handleDeleteContainer}
              onPruneStopped={() => handlePruneEntity('container', 'Prune Stopped Containers')}
              onOpenTerminal={(c) => setTerminalContainer(c)}
              onOpenLogs={(c) => setLogsContainer(c)}
              onOpenInspect={handleOpenInspect}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeView === 'images' ? 'block' : 'none' }}>
            <ImagesTab
              images={overview.images}
              onDelete={handleDeleteImage}
              onPruneUnused={() => handlePruneEntity('image', 'Prune Dangling Images')}
              onOpenInspect={handleOpenInspect}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeView === 'volumes' ? 'block' : 'none' }}>
            <VolumesTab
              volumes={overview.volumes}
              onDelete={handleDeleteVolume}
              onPruneUnused={() => handlePruneEntity('volume', 'Prune Unused Volumes')}
              onOpenInspect={handleOpenInspect}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeView === 'networks' ? 'block' : 'none' }}>
            <NetworksTab
              networks={overview.networks}
              onDelete={handleDeleteNetwork}
              onPruneUnused={() => handlePruneEntity('network', 'Prune Unused Networks')}
              onOpenInspect={handleOpenInspect}
              isLoading={isLoading}
            />
          </div>

          <div style={{ display: activeView === 'settings' ? 'block' : 'none' }}>
            <SettingsView
              engines={overview.engines}
              activeEngine={activeEngine}
              onSelectEngine={handleSelectEngine}
              onOpenSystemPrune={() => setSystemPruneOpen(true)}
              onRefresh={() => loadData(activeEngine)}
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

      {/* Inspect Modal */}
      <InspectModal
        isOpen={inspectModalState.isOpen}
        kind={inspectModalState.kind}
        id={inspectModalState.id}
        name={inspectModalState.name}
        activeEngine={activeEngine}
        onClose={() => setInspectModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* System Prune Modal */}
      <SystemPruneModal
        isOpen={systemPruneOpen}
        activeEngine={activeEngine}
        onPrune={handleSystemPrune}
        onClose={() => setSystemPruneOpen(false)}
        isLoading={isLoading}
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
    </Page>
  );
};
