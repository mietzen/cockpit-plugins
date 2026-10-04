export interface BinaryInfo {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface ServiceInfo {
  unit: string;
  active: boolean;
  state: string;
  enabled: boolean;
  pid: number | null;
  started_at: string | null;
}

export interface CodeServerConfigData {
  bind_addr?: string;
  socket?: string;
  socket_mode?: string;
  host: string;
  port: number;
  auth: "password" | "none" | string;
  password?: string;
  cert: boolean | string;
  disable_telemetry?: boolean;
}

export interface CodeServerStatus {
  status: "ok" | "error";
  user?: string;
  uid?: number;
  binary: BinaryInfo;
  service: ServiceInfo;
  config: CodeServerConfigData;
  config_path: string;
  error?: string;
}

export interface CommandResult {
  status: "ok" | "error";
  message?: string;
  error?: string;
  output?: string;
}

export const getCodeServerUrl = (uid?: number | string | null): string => {
  const effectiveUid = uid ?? 1000;
  return `/code-server/${effectiveUid}/`;
};

