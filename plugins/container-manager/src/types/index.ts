export type EngineType = 'docker' | 'podman' | 'none';

export interface EngineInfo {
  installed: boolean;
  version: string;
  path: string;
  active: boolean;
  service?: Record<string, any>;
}

export interface EnginesDetection {
  docker: EngineInfo;
  podman: EngineInfo;
  active_engine: EngineType;
}

export type ContainerState = 'running' | 'exited' | 'paused' | 'created' | 'restarting' | 'dead';

export interface ContainerItem {
  id: string;
  shortId: string;
  name: string;
  image: string;
  state: ContainerState;
  status: string;
  created: string;
  ports: string;
  command: string;
  networks: string[];
}

export interface ImageItem {
  id: string;
  shortId: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
  inUse: boolean;
}

export interface VolumeItem {
  name: string;
  driver: string;
  scope: string;
  mountpoint: string;
  inUse: boolean;
}

export interface NetworkItem {
  id: string;
  shortId: string;
  name: string;
  driver: string;
  scope: string;
  subnet?: string;
  isBuiltIn: boolean;
  inUse: boolean;
}

export interface ContainerOverview {
  status: string;
  engines: EnginesDetection;
  active_engine: EngineType;
  containers: ContainerItem[];
  images: ImageItem[];
  volumes: VolumeItem[];
  networks: NetworkItem[];
}

export interface TlsStatus {
  engine: string;
  enabled: boolean;
  certsExist: boolean;
  port: number;
  expiry: string;
  sans: string[];
  service: string;
}

export interface ClientCertBundle {
  status: string;
  ca: string;
  cert: string;
  key: string;
  zipBase64: string;
  zipFilename: string;
}
