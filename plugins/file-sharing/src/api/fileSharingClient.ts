import { FileSharingOverview, SmbShare, NfsExport, SmbGlobal } from '../types';

declare global {
  interface Window {
    cockpit?: any;
  }
}

const HELPER_PATH = '/usr/libexec/cockpit-file-sharing/file_sharing_helper.py';

// Default fallback when running in standalone dev mode
const DEFAULT_OVERVIEW: FileSharingOverview = {
  services: {
    smbd: { unit: 'smbd', active: false, state: 'inactive', enabled: false, installed: false },
    nmbd: { unit: 'nmbd', active: false, state: 'inactive', enabled: false, installed: false },
    nfs: { unit: 'nfs-kernel-server', active: false, state: 'inactive', enabled: false, installed: false },
  },
  smb: { global: { workgroup: 'WORKGROUP' }, shares: [] },
  nfs: { exports: [], client_map: [] },
  users: { smb_users: [], unix_users: [], access_matrix: [] },
  sessions: [],
  zfs_mounts: [],
};

async function execHelper(args: string[]): Promise<any> {
  if (!window.cockpit) {
    return { status: 'success' };
  }

  return new Promise((resolve, reject) => {
    window.cockpit.spawn([HELPER_PATH, ...args], { superuser: 'require' })
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

export const fileSharingApi = {
  async getOverview(ansibleBegin?: string, ansibleEnd?: string): Promise<FileSharingOverview> {
    if (!window.cockpit) {
      return Promise.resolve(DEFAULT_OVERVIEW);
    }
    const args = ['get_overview'];
    if (ansibleBegin) args.push('--ansible-begin', ansibleBegin);
    if (ansibleEnd) args.push('--ansible-end', ansibleEnd);

    const res = await execHelper(args);
    return res;
  },

  async saveSmbShare(share: Partial<SmbShare>): Promise<void> {
    const res = await execHelper(['save_smb_share', '--data', JSON.stringify(share)]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async deleteSmbShare(name: string): Promise<void> {
    const res = await execHelper(['delete_smb_share', '--name', name]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async saveSmbGlobal(globalData: SmbGlobal): Promise<void> {
    const res = await execHelper(['save_smb_global', '--data', JSON.stringify(globalData)]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async saveNfsExport(exportData: { path: string; clients: any[] }): Promise<void> {
    const res = await execHelper(['save_nfs_export', '--data', JSON.stringify(exportData)]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async deleteNfsExport(path: string): Promise<void> {
    const res = await execHelper(['delete_nfs_export', '--path', path]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async createSmbUser(username: string, password: string):Promise<void> {
    const res = await execHelper(['create_smb_user', '--username', username, '--password', password]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async setSmbUserPassword(username: string, password: string): Promise<void> {
    const res = await execHelper(['set_smb_user_password', '--username', username, '--password', password]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async setSmbUserState(username: string, enable: boolean): Promise<void> {
    const args = ['set_smb_user_state', '--username', username];
    if (enable) args.push('--enable');
    const res = await execHelper(args);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async deleteSmbUser(username: string): Promise<void> {
    const res = await execHelper(['delete_smb_user', '--username', username]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  },

  async serviceAction(service: string, verb: 'start' | 'stop' | 'restart' | 'reload'): Promise<void> {
    const res = await execHelper(['service_action', '--service', service, '--verb', verb]);
    if (res.status === 'error') {
      throw new Error(res.message);
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).fileSharingApi = fileSharingApi;
}
