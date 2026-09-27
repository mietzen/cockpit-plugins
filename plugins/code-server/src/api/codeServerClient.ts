import { CodeServerStatus, CommandResult, CodeServerConfigData } from "../types";

declare const cockpit: any;

const HELPER_PATH = "/usr/libexec/cockpit-code-server/code_server_helper.py";

export const DEFAULT_MOCK_STATUS: CodeServerStatus = {
  status: "ok",
  binary: {
    installed: true,
    version: "4.96.4",
    path: "/usr/bin/code-server",
  },
  service: {
    unit: "code-server@test-user.service",
    active: true,
    state: "active",
    enabled: true,
    pid: 4128,
    started_at: "Sun 2026-09-27 10:00:00 UTC",
  },
  config: {
    bind_addr: "127.0.0.1:8080",
    host: "127.0.0.1",
    port: 8080,
    auth: "password",
    password: "mock-password-1234",
    cert: false,
    disable_telemetry: true,
  },
  config_path: "/home/test-user/.config/code-server/config.yaml",
};

export class CodeServerClient {
  private isCockpitAvailable(): boolean {
    return typeof cockpit !== "undefined" && typeof cockpit.spawn === "function";
  }

  private async executeHelper(args: string[]): Promise<any> {
    if (!this.isCockpitAvailable()) {
      return null;
    }

    try {
      const proc = cockpit.spawn([HELPER_PATH, ...args], {
        superuser: "require",
        err: "message",
      });
      const output = await proc;
      return JSON.parse(output);
    } catch (err: any) {
      if (err?.message) {
        try {
          return JSON.parse(err.message);
        } catch {
          throw new Error(err.message);
        }
      }
      throw err;
    }
  }

  async getStatus(username?: string): Promise<CodeServerStatus> {
    if (!this.isCockpitAvailable()) {
      return DEFAULT_MOCK_STATUS;
    }

    const args = ["status"];
    if (username) {
      args.push("--user", username);
    }

    const res = await this.executeHelper(args);
    return res || DEFAULT_MOCK_STATUS;
  }

  async serviceAction(
    verb: "start" | "stop" | "restart" | "enable" | "disable" | "reload",
    username?: string
  ): Promise<CommandResult> {
    if (!this.isCockpitAvailable()) {
      return { status: "ok", message: `Mock service ${verb} succeeded` };
    }

    const args = ["service", verb];
    if (username) {
      args.push("--user", username);
    }

    return await this.executeHelper(args);
  }

  async saveConfig(config: Partial<CodeServerConfigData>, username?: string): Promise<CommandResult> {
    if (!this.isCockpitAvailable()) {
      return { status: "ok", message: "Mock config saved" };
    }

    const args = ["save_config", "--data", JSON.stringify(config)];
    if (username) {
      args.push("--user", username);
    }

    return await this.executeHelper(args);
  }

  async install(username?: string): Promise<CommandResult> {
    if (!this.isCockpitAvailable()) {
      return { status: "ok", message: "Mock install complete" };
    }

    const args = ["install"];
    if (username) {
      args.push("--user", username);
    }

    return await this.executeHelper(args);
  }
}

export const codeServerApi = new CodeServerClient();
