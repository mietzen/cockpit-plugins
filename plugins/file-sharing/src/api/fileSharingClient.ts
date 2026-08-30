import { FileSharingOverview, SmbShare, NfsExport, SmbGlobal } from '../types';

declare global {
  interface Window {
    cockpit?: any;
  }
}

const HELPER_PATH = '/usr/libexec/cockpit-file-sharing/file_sharing_helper.py';

// Mock data for local Vite preview/dev environment
const MOCK_OVERVIEW: FileSharingOverview = {
  services: {
    smbd: { unit: 'smbd', active: true, state: 'active', enabled: true, installed: true },
    nmbd: { unit: 'nmbd', active: true, state: 'active', enabled: true, installed: true },
    nfs: { unit: 'nfs-kernel-server', active: true, state: 'active', enabled: true, installed: true }
  },
  smb: {
    global: {
      workgroup: 'WORKGROUP',
      'server string': 'Cockpit File Server',
      'passdb backend': 'tdbsam',
      security: 'user',
      'server min protocol': 'SMB2_02',
      'server max protocol': 'SMB3'
    },
    shares: [
      {
        name: 'public',
        path: '/srv/samba/public',
        comment: 'Public Share for all guests',
        read_only: false,
        browseable: true,
        guest_ok: true,
        is_managed: false
      },
      {
        name: 'backups',
        path: '/tank/backups',
        comment: 'Ansible Managed Backup Repository',
        read_only: true,
        browseable: true,
        guest_ok: false,
        valid_users: 'alice, backup_agent',
        is_managed: true,
        managed_by: 'storage_playbook'
      }
    ]
  },
  nfs: {
    exports: [
      {
        path: '/tank/media',
        clients: [
          { host: '192.168.1.0/24', read_only: false, sync: true, root_squash: true, all_squash: false, no_subtree_check: true, options: ['rw', 'sync', 'no_subtree_check'] },
          { host: '*', read_only: true, sync: true, root_squash: true, all_squash: false, no_subtree_check: true, options: ['ro', 'sync', 'no_subtree_check'] }
        ],
        file: '/etc/exports.d/cockpit.exports',
        is_managed: false
      },
      {
        path: '/tank/k8s_volumes',
        clients: [
          { host: '10.0.0.0/16', read_only: false, sync: true, root_squash: false, all_squash: false, no_subtree_check: true, options: ['rw', 'sync', 'no_root_squash', 'no_subtree_check'] }
        ],
        file: '/etc/exports',
        is_managed: true,
        managed_by: 'k8s_infra'
      }
    ],
    client_map: [
      {
        client: '192.168.1.0/24',
        exports_count: 1,
        exports: [
          { path: '/tank/media', read_only: false, sync: true, root_squash: true, all_squash: false, no_subtree_check: true, options: ['rw', 'sync'], is_managed: false }
        ]
      },
      {
        client: '10.0.0.0/16',
        exports_count: 1,
        exports: [
          { path: '/tank/k8s_volumes', read_only: false, sync: true, root_squash: false, all_squash: false, no_subtree_check: true, options: ['rw', 'sync', 'no_root_squash'], is_managed: true, managed_by: 'k8s_infra' }
        ]
      }
    ]
  },
  users: {
    smb_users: [
      { username: 'alice', full_name: 'Alice Admin', sid: 'S-1-5-21-12345-1000', is_enabled: true },
      { username: 'bob', full_name: 'Bob Operator', sid: 'S-1-5-21-12345-1001', is_enabled: true },
      { username: 'charlie', full_name: 'Charlie Inactive', sid: 'S-1-5-21-12345-1002', is_enabled: false }
    ],
    unix_users: ['alice', 'bob', 'charlie', 'debian', 'test-user'],
    access_matrix: [
      {
        username: 'alice',
        full_name: 'Alice Admin',
        is_enabled: true,
        shares: [
          { share_name: 'public', share_path: '/srv/samba/public', access: 'read_write', reason: 'Default read only = no', is_managed: false, guest_ok: true },
          { share_name: 'backups', share_path: '/tank/backups', access: 'read_only', reason: 'In valid users list, read only = yes', is_managed: true, guest_ok: false }
        ]
      },
      {
        username: 'bob',
        full_name: 'Bob Operator',
        is_enabled: true,
        shares: [
          { share_name: 'public', share_path: '/srv/samba/public', access: 'read_write', reason: 'Default read only = no', is_managed: false, guest_ok: true },
          { share_name: 'backups', share_path: '/tank/backups', access: 'denied', reason: 'Not in valid users list', is_managed: true, guest_ok: false }
        ]
      }
    ]
  },
  sessions: [
    { pid: '1428', username: 'alice', group: 'users', machine: '192.168.1.105 (MacBook-Pro)', protocol: 'SMB3_11' }
  ],
  zfs_mounts: [
    { dataset: 'tank/data', mountpoint: '/tank/data' },
    { dataset: 'tank/media', mountpoint: '/tank/media' },
    { dataset: 'tank/backups', mountpoint: '/tank/backups' }
  ]
};

async function execHelper(args: string[]): Promise<any> {
  if (!window.cockpit) {
    console.warn('Running outside Cockpit. Using mock execution.');
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
      return Promise.resolve(MOCK_OVERVIEW);
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
