export interface SmbShare {
  name: string;
  path: string;
  comment?: string;
  read_only: boolean;
  browseable: boolean;
  guest_ok: boolean;
  valid_users?: string;
  write_list?: string;
  read_list?: string;
  invalid_users?: string;
  force_user?: string;
  force_group?: string;
  create_mask?: string;
  directory_mask?: string;
  vfs_objects?: string;
  is_managed: boolean;
  managed_by?: string;
}

export interface SmbGlobal {
  workgroup?: string;
  "server string"?: string;
  "passdb backend"?: string;
  security?: string;
  "server min protocol"?: string;
  "server max protocol"?: string;
  [key: string]: string | undefined;
}

export interface NfsClient {
  host: string;
  options?: string[];
  read_only: boolean;
  sync: boolean;
  root_squash: boolean;
  all_squash: boolean;
  no_subtree_check: boolean;
  anonuid?: string;
  anongid?: string;
}

export interface NfsExport {
  path: string;
  clients: NfsClient[];
  file?: string;
  is_managed: boolean;
  managed_by?: string;
  raw_line?: string;
}

export interface SmbUser {
  username: string;
  full_name?: string;
  sid?: string;
  flags?: string;
  is_enabled: boolean;
}

export interface UserShareAccess {
  share_name: string;
  share_path: string;
  access: 'read_write' | 'read_only' | 'denied' | 'guest_only';
  reason: string;
  is_managed: boolean;
  guest_ok: boolean;
}

export interface UserAccessMatrixItem {
  username: string;
  full_name?: string;
  is_enabled: boolean;
  shares: UserShareAccess[];
}

export interface NfsClientExportItem {
  path: string;
  read_only: boolean;
  sync: boolean;
  root_squash: boolean;
  all_squash: boolean;
  no_subtree_check: boolean;
  options: string[];
  is_managed: boolean;
  managed_by?: string;
}

export interface NfsClientMapItem {
  client: string;
  exports_count: number;
  exports: NfsClientExportItem[];
}

export interface ServiceStatus {
  unit: string;
  active: boolean;
  state: string;
  enabled: boolean;
  installed: boolean;
}

export interface SmbSession {
  pid: string;
  username: string;
  group: string;
  machine: string;
  protocol: string;
}

export interface ZfsMount {
  dataset: string;
  mountpoint: string;
}

export interface FileSharingOverview {
  services: {
    smbd: ServiceStatus;
    nmbd: ServiceStatus;
    nfs: ServiceStatus;
  };
  smb: {
    global: SmbGlobal;
    shares: SmbShare[];
  };
  nfs: {
    exports: NfsExport[];
    client_map: NfsClientMapItem[];
  };
  users: {
    smb_users: SmbUser[];
    unix_users: string[];
    access_matrix: UserAccessMatrixItem[];
  };
  sessions: SmbSession[];
  zfs_mounts: ZfsMount[];
  versions?: {
    smb: string;
    nfs: string;
  };
}
