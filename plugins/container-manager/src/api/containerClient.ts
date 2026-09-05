import {
  ContainerOverview,
  TlsStatus,
  ClientCertBundle,
} from '../types';

declare global {
  interface Window {
    cockpit?: any;
  }
}

const HELPER_PATH = '/usr/libexec/cockpit-container-manager/container_helper.py';

export const DEFAULT_EMPTY_OVERVIEW: ContainerOverview = {
  status: 'success',
  engines: {
    docker: { installed: false, version: '', path: '', active: false, service: { active: false } },
    podman: { installed: false, version: '', path: '', active: false, service: { active: false } },
    active_engine: 'none',
  },
  active_engine: 'none',
  containers: [],
  images: [],
  volumes: [],
  networks: [],
};

export const DEFAULT_MOCK_OVERVIEW: ContainerOverview = {
  status: 'success',
  engines: {
    docker: {
      installed: true,
      version: '27.1.1',
      path: '/usr/bin/docker',
      active: true,
      service: { active: true },
    },
    podman: {
      installed: false,
      version: '',
      path: '',
      active: false,
      service: { active: false },
    },
    active_engine: 'docker',
  },
  active_engine: 'docker',
  containers: [
    {
      id: 'c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
      shortId: 'c1a2b3c4d5e6',
      name: 'web-frontend',
      image: 'nginx:alpine',
      state: 'running',
      status: 'Up 3 hours',
      created: '3 hours ago',
      ports: '0.0.0.0:8080->80/tcp',
      command: 'nginx -g "daemon off;"',
      networks: ['bridge'],
    },
    {
      id: 'd2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
      shortId: 'd2e3f4a5b6c7',
      name: 'postgres-db',
      image: 'postgres:16-alpine',
      state: 'running',
      status: 'Up 5 hours',
      ports: '0.0.0.0:5432->5432/tcp',
      created: '5 hours ago',
      command: 'docker-entrypoint.sh postgres',
      networks: ['bridge'],
    },
    {
      id: 'e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
      shortId: 'e3f4a5b6c7d8',
      name: 'temp-worker',
      image: 'alpine:latest',
      state: 'exited',
      status: 'Exited (0) 45 minutes ago',
      ports: '',
      created: '1 day ago',
      command: 'sh -c "echo worker finished"',
      networks: ['bridge'],
    },
  ],
  images: [
    {
      id: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      shortId: '1a2b3c4d5e6f',
      repository: 'nginx',
      tag: 'alpine',
      size: '42.5 MB',
      created: '2 weeks ago',
      inUse: true,
    },
    {
      id: 'sha256:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e',
      shortId: '2b3c4d5e6f7a',
      repository: 'postgres',
      tag: '16-alpine',
      size: '280.0 MB',
      created: '1 month ago',
      inUse: true,
    },
    {
      id: 'sha256:3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f',
      shortId: '3c4d5e6f7a8b',
      repository: 'alpine',
      tag: 'latest',
      size: '7.8 MB',
      created: '2 months ago',
      inUse: false,
    },
  ],
  volumes: [
    {
      name: 'pg_data',
      driver: 'local',
      scope: 'local',
      mountpoint: '/var/lib/docker/volumes/pg_data/_data',
      inUse: true,
    },
    {
      name: 'old_cache',
      driver: 'local',
      scope: 'local',
      mountpoint: '/var/lib/docker/volumes/old_cache/_data',
      inUse: false,
    },
  ],
  networks: [
    {
      id: 'n1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
      shortId: 'n1a2b3c4d5e6',
      name: 'bridge',
      driver: 'bridge',
      scope: 'local',
      subnet: '172.17.0.0/16',
      isBuiltIn: true,
      inUse: true,
    },
    {
      id: 'n2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
      shortId: 'n2b3c4d5e6f7',
      name: 'app-network',
      driver: 'bridge',
      scope: 'local',
      subnet: '172.18.0.0/16',
      isBuiltIn: false,
      inUse: false,
    },
  ],
};

const DEFAULT_MOCK_TLS: TlsStatus = {
  engine: 'docker',
  enabled: false,
  certsExist: false,
  port: 2376,
  expiry: '',
  sans: ['127.0.0.1', 'localhost'],
  service: 'docker.service',
};

async function execHelper(args: string[]): Promise<any> {
  if (!window.cockpit) {
    return { status: 'success' };
  }

  return new Promise((resolve, reject) => {
    window.cockpit
      .spawn(['python3', HELPER_PATH, ...args], { superuser: 'require', err: 'message' })
      .then((output: string) => {
        try {
          const res = JSON.parse(output);
          resolve(res);
        } catch {
          resolve({ status: 'success', output });
        }
      })
      .catch((err: any) => {
        reject(new Error(err.message || String(err)));
      });
  });
}

export const containerApi = {
  async getOverview(engine?: string): Promise<ContainerOverview> {
    if (!window.cockpit) {
      return Promise.resolve(DEFAULT_MOCK_OVERVIEW);
    }
    const args = ['get_overview'];
    if (engine) args.push('--engine', engine);
    return execHelper(args);
  },

  async containerAction(
    id: string,
    action: 'start' | 'stop' | 'kill' | 'restart',
    engine?: string
  ): Promise<any> {
    if (!window.cockpit) {
      return Promise.resolve({ status: 'success' });
    }
    const args = ['container_action', '--id', id, '--action', action];
    if (engine) args.push('--engine', engine);
    return execHelper(args);
  },

  async deleteEntity(
    kind: 'container' | 'image' | 'volume' | 'network',
    id: string,
    force: boolean = false,
    engine?: string
  ): Promise<any> {
    if (!window.cockpit) {
      return Promise.resolve({ status: 'success' });
    }
    const args = ['delete_entity', '--kind', kind, '--id', id];
    if (force) args.push('--force');
    if (engine) args.push('--engine', engine);
    return execHelper(args);
  },

  async prune(
    kind: 'container' | 'image' | 'volume' | 'network' | 'system',
    all: boolean = false,
    volumes: boolean = false,
    engine?: string
  ): Promise<any> {
    if (!window.cockpit) {
      return Promise.resolve({ status: 'success', output: 'Reclaimed 0B' });
    }
    const args = ['prune', '--kind', kind];
    if (all) args.push('--all');
    if (volumes) args.push('--volumes');
    if (engine) args.push('--engine', engine);
    return execHelper(args);
  },

  async getTlsStatus(engine?: string): Promise<TlsStatus> {
    if (!window.cockpit) {
      return Promise.resolve(DEFAULT_MOCK_TLS);
    }
    const args = ['get_tls_status'];
    if (engine) args.push('--engine', engine);
    const res = await execHelper(args);
    return res.tls || DEFAULT_MOCK_TLS;
  },

  async setupTls(engine: string, port: number, sans: string[]): Promise<any> {
    if (!window.cockpit) {
      return Promise.resolve({ status: 'success', port, sans });
    }
    const args = ['setup_tls', '--engine', engine, '--port', String(port)];
    if (sans.length > 0) {
      args.push('--sans', sans.join(','));
    }
    return execHelper(args);
  },

  async disableTls(engine: string): Promise<any> {
    if (!window.cockpit) {
      return Promise.resolve({ status: 'success' });
    }
    return execHelper(['disable_tls', '--engine', engine]);
  },

  async getClientBundle(engine: string): Promise<ClientCertBundle> {
    if (!window.cockpit) {
      return Promise.resolve({
        status: 'success',
        ca: 'MOCK CA CERTIFICATE',
        cert: 'MOCK CLIENT CERTIFICATE',
        key: 'MOCK CLIENT KEY',
        zipBase64: 'UEsDBBQAAAAIAAA=',
        zipFilename: `${engine}-tls-client-certs.zip`,
      });
    }
    return execHelper(['get_client_bundle', '--engine', engine]);
  },

  spawnTerminal(containerId: string, cmd: string = '/bin/sh', engine: string = 'docker'): any {
    if (!window.cockpit) {
      return null;
    }
    const parts = cmd.trim().split(/\s+/);
    return window.cockpit.spawn([engine, 'exec', '-i', '-t', containerId, ...parts], {
      pty: true,
      superuser: 'require',
    });
  },

  spawnLogs(
    containerId: string,
    tail: number = 200,
    timestamps: boolean = false,
    engine: string = 'docker'
  ): any {
    if (!window.cockpit) {
      return null;
    }
    const args = [engine, 'logs', '-f', '--tail', String(tail)];
    if (timestamps) {
      args.push('-t');
    }
    args.push(containerId);
    return window.cockpit.spawn(args, { superuser: 'require' });
  },
};
