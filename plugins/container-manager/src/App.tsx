import React, { useState, useEffect, useCallback } from 'react';
import '@patternfly/react-core/dist/styles/base.css';
import '@cockpit-plugins/common/src/styles/cockpit-theme.css';
import {
  Alert,
  AlertGroup,
  AlertActionCloseButton,
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

const parseView = (segments: string[]): string => {
  const clean = segments.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) return 'dashboard';
  const v = clean[0];
  if (['dashboard', 'containers', 'images', 'volumes', 'networks', 'settings'].includes(v)) {
    return v;
  }
  return 'dashboard';
};

export const App: React.FC = () => {
  const isDark = useCockpitTheme();

  const [activeView, setActiveView] = useState<string>(() => {
    let initialSegments: string[] = [];
    if (typeof window !== 'undefined' && window.cockpit && window.cockpit.location && Array.isArray(window.cockpit.location.path) && window.cockpit.location.path.length > 0) {
      initialSegments = window.cockpit.location.path;
    } else if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash) {
        initialSegments = hash.split('/').filter(Boolean);
      }
    }
    return parseView(initialSegments);
  });

  const lastNavigatedPathRef = React.useRef<string>('');

  const navigateToView = useCallback((view: string) => {
    setActiveView(view);
    lastNavigatedPathRef.current = view;

    const segments = view === 'dashboard' ? [] : [view];
    if (typeof window !== 'undefined' && window.cockpit && window.cockpit.location && typeof window.cockpit.location.go === 'function') {
      window.cockpit.location.go(segments);
    } else if (typeof window !== 'undefined') {
      const targetHash = segments.length > 0 ? `#/${segments.join('/')}` : '#/';
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, '', targetHash);
      }
    }
  }, []);

  const syncFromUrl = useCallback(() => {
    let segments: string[] = [];
    if (typeof window !== 'undefined' && window.cockpit && window.cockpit.location && Array.isArray(window.cockpit.location.path) && window.cockpit.location.path.length > 0) {
      segments = window.cockpit.location.path;
    } else if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash) {
        segments = hash.split('/').filter(Boolean);
      }
    }
    const currentPathStr = segments.length > 0 ? segments[0].toLowerCase() : 'dashboard';
    if (currentPathStr === lastNavigatedPathRef.current) {
      return;
    }
    lastNavigatedPathRef.current = currentPathStr;
    setActiveView(parseView(segments));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.cockpit && window.cockpit.location) {
      const handleLocationChanged = () => syncFromUrl();
      window.cockpit.addEventListener('locationchanged', handleLocationChanged);
      return () => window.cockpit.removeEventListener('locationchanged', handleLocationChanged);
    }
  }, [syncFromUrl]);

  useEffect(() => {
    const handleHashChange = () => syncFromUrl();
    const handlePopState = () => syncFromUrl();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [syncFromUrl]);

  const [overview, setOverview] = useState<ContainerOverview>(
    typeof window !== 'undefined' && window.cockpit ? DEFAULT_EMPTY_OVERVIEW : DEFAULT_MOCK_OVERVIEW
  );
  const [activeEngine, setActiveEngine] = useState<EngineType>(() => {
    try {
      const saved = localStorage.getItem('cockpit_container_engine');
      if (saved === 'docker' || saved === 'podman') return saved as EngineType;
    } catch {}
    return 'auto';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [alerts, setAlerts] = useState<
    Array<{ key: number; variant: 'success' | 'danger' | 'warning' | 'info'; title: string; message?: string }>
  >([]);

  const addAlert = (title: string, variant: 'success' | 'danger' | 'warning' | 'info' = 'success', message?: string) => {
    const key = Date.now() + Math.random();
    setAlerts((prev) => [...prev, { key, variant, title, message }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.key !== key));
    }, 5000);
  };

  const removeAlert = (key: number) => {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  };

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
    } catch (err: any) {
      addAlert('Failed to load container overview', 'danger', err?.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleRefresh = () => {
      loadData();
    };

    window.addEventListener('hashchange', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (typeof window !== 'undefined' && window.cockpit && typeof window.cockpit.addEventListener === 'function') {
      window.cockpit.addEventListener('locationchanged', handleRefresh);
    }

    return () => {
      window.removeEventListener('hashchange', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (typeof window !== 'undefined' && window.cockpit && typeof window.cockpit.removeEventListener === 'function') {
        window.cockpit.removeEventListener('locationchanged', handleRefresh);
      }
    };
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
        addAlert(`Failed to ${action} container`, 'danger', res.error);
      } else {
        addAlert(`Container ${action} succeeded`, 'success');
        await loadData(activeEngine);
      }
    } catch (err: any) {
      addAlert(`Failed to ${action} container`, 'danger', err?.message);
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
            addAlert('Failed to delete container', 'danger', res.error);
          } else {
            addAlert(`Container ${container.name} deleted`, 'success');
            await loadData(activeEngine);
          }
        } catch (err: any) {
          addAlert('Failed to delete container', 'danger', err?.message);
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
            addAlert('Failed to delete image', 'danger', res.error);
          } else {
            addAlert(`Image ${image.repository}:${image.tag} deleted`, 'success');
            await loadData(activeEngine);
          }
        } catch (err: any) {
          addAlert('Failed to delete image', 'danger', err?.message);
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
            addAlert('Failed to delete volume', 'danger', res.error);
          } else {
            addAlert(`Volume ${volume.name} deleted`, 'success');
            await loadData(activeEngine);
          }
        } catch (err: any) {
          addAlert('Failed to delete volume', 'danger', err?.message);
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
            addAlert('Failed to delete network', 'danger', res.error);
          } else {
            addAlert(`Network ${network.name} deleted`, 'success');
            await loadData(activeEngine);
          }
        } catch (err: any) {
          addAlert('Failed to delete network', 'danger', err?.message);
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
            addAlert(`Failed to prune ${kind}s`, 'danger', res.error);
          } else {
            addAlert(`Pruned unused ${kind}s`, 'success');
            await loadData(activeEngine);
          }
        } catch (err: any) {
          addAlert(`Failed to prune ${kind}s`, 'danger', err?.message);
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
        addAlert('Failed to perform system prune', 'danger', res.error);
      } else {
        addAlert('System prune completed successfully', 'success');
        await loadData(activeEngine);
      }
    } catch (err: any) {
      addAlert('Failed to perform system prune', 'danger', err?.message);
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
      {/* Toast Alert Notifications */}
      <AlertGroup isToast isLiveRegion>
        {alerts.map((alert) => (
          <Alert
            key={alert.key}
            variant={alert.variant}
            title={alert.title}
            actionClose={<AlertActionCloseButton onClose={() => removeAlert(alert.key)} />}
            timeout={5000}
          >
            {alert.message}
          </Alert>
        ))}
      </AlertGroup>

      {/* Top Sticky Navigation Bar */}
      <Navigation
        activeView={activeView}
        onSelectView={(v) => navigateToView(v)}
        onRefresh={() => loadData(activeEngine)}
        isLoading={isLoading}
        containerCount={overview.containers.length}
        imageCount={overview.images.length}
        volumeCount={overview.volumes.length}
        networkCount={overview.networks.length}
      />

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
              engines={overview.engines}
              activeEngine={activeEngine}
              onNavigateTab={(tab) => navigateToView(tab)}
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
              onNotify={(variant, title, message) => addAlert(title, variant, message)}
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
        isLoading={isLoading}
        onConfirm={async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          await confirmModal.onConfirm();
        }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </Page>
  );
};
