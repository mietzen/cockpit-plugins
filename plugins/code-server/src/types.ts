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
  bind_addr: string;
  host: string;
  port: number;
  auth: "password" | "none" | string;
  password?: string;
  cert: boolean;
  disable_telemetry?: boolean;
}

export interface CodeServerStatus {
  status: "ok" | "error";
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

export const getCodeServerUrl = (config?: Partial<CodeServerConfigData>): string => {
  const port = config?.port || 8080;
  const protocol =
    config?.cert || (typeof window !== "undefined" && window.location.protocol === "https:")
      ? "https:"
      : "http:";
  const hostName = typeof window !== "undefined" ? window.location.hostname : "localhost";
  return `${protocol}//${hostName}:${port}/`;
};
