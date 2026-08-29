import React, { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Label,
  Modal,
  ModalVariant,
  Tabs,
  Tab,
  TabTitleText,
  TextInput,
  Tooltip
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import {
  UsersIcon,
  UserPlusIcon,
  KeyIcon,
  TrashIcon,
  CheckCircleIcon,
  BanIcon,
  TableIcon,
  UserIcon
} from '@patternfly/react-icons';
import { SmbUser, UserAccessMatrixItem } from '../types';

interface UsersTabProps {
  users: SmbUser[];
  unixUsers: string[];
  accessMatrix: UserAccessMatrixItem[];
  onCreateUser: (username: string, password: string) => Promise<void>;
  onSetPassword: (username: string, password: string) => Promise<void>;
  onSetState: (username: string, enable: boolean) => Promise<void>;
  onDeleteUser: (username: string) => Promise<void>;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  unixUsers,
  accessMatrix,
  onCreateUser,
  onSetPassword,
  onSetState,
  onDeleteUser
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'matrix'>('users');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswdModalOpen, setIsPasswdModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setUsername(unixUsers.length > 0 ? unixUsers[0] : '');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenPasswd = (u: string) => {
    setSelectedUser(u);
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setIsPasswdModalOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password cannot be empty');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onCreateUser(username.trim(), password);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create Samba user');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePasswd = async () => {
    if (!password) {
      setError('Password cannot be empty');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSetPassword(selectedUser, password);
      setIsPasswdModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      await onDeleteUser(selectedUser);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete Samba user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} style={{ width: '100%' }}>
            <FlexItem>
              <CardTitle>
                <UsersIcon style={{ marginRight: 8 }} />
                Samba User Accounts & Permissions
              </CardTitle>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<UserPlusIcon />} onClick={handleOpenAdd}>
                Add Samba User
              </Button>
            </FlexItem>
          </Flex>
        </CardHeader>
        <CardBody>
          <Tabs
            activeKey={activeSubTab}
            onSelect={(_e, key) => setActiveSubTab(key as any)}
            style={{ marginBottom: '1.5rem' }}
          >
            <Tab eventKey="users" title={<TabTitleText><UserIcon style={{ marginRight: 6 }} />Samba Users ({users.length})</TabTitleText>} />
            <Tab eventKey="matrix" title={<TabTitleText><TableIcon style={{ marginRight: 6 }} />User Access Matrix ({accessMatrix.length})</TabTitleText>} />
          </Tabs>

          {activeSubTab === 'users' && (
            <Table aria-label="Samba Users Table" variant="compact">
              <Thead>
                <Tr>
                  <Th>Username</Th>
                  <Th>Full Name</Th>
                  <Th>Status</Th>
                  <Th>User SID</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {users.map((u) => (
                  <Tr key={u.username}>
                    <Td dataLabel="Username">
                      <strong><code>{u.username}</code></strong>
                    </Td>
                    <Td dataLabel="Full Name">{u.full_name || '-'}</Td>
                    <Td dataLabel="Status">
                      {u.is_enabled ? (
                        <Label color="green" icon={<CheckCircleIcon />}>Enabled</Label>
                      ) : (
                        <Label color="red" icon={<BanIcon />}>Disabled</Label>
                      )}
                    </Td>
                    <Td dataLabel="User SID">
                      <code style={{ fontSize: '0.8rem' }}>{u.sid || '-'}</code>
                    </Td>
                    <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                      <Button
                        variant="plain"
                        icon={<KeyIcon />}
                        onClick={() => handleOpenPasswd(u.username)}
                        title="Set password"
                      />
                      <Button
                        variant="plain"
                        icon={u.is_enabled ? <BanIcon /> : <CheckCircleIcon />}
                        onClick={() => onSetState(u.username, !u.is_enabled)}
                        title={u.is_enabled ? 'Disable user' : 'Enable user'}
                      />
                      <Button
                        variant="plain"
                        icon={<TrashIcon />}
                        onClick={() => {
                          setSelectedUser(u.username);
                          setIsDeleteModalOpen(true);
                        }}
                        title="Delete Samba user"
                      />
                    </Td>
                  </Tr>
                ))}
                {users.length === 0 && (
                  <Tr>
                    <Td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      No Samba users configured in passdb. Click "Add Samba User" to create one.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          )}

          {activeSubTab === 'matrix' && (
            <Table aria-label="Samba User Access Matrix" variant="compact">
              <Thead>
                <Tr>
                  <Th>User</Th>
                  <Th>Share Name</Th>
                  <Th>Computed Effective Access</Th>
                  <Th>Access Rationale</Th>
                </Tr>
              </Thead>
              <Tbody>
                {accessMatrix.map((item) => (
                  <React.Fragment key={item.username}>
                    {item.shares.map((sh, idx) => (
                      <Tr key={`${item.username}-${sh.share_name}`}>
                        {idx === 0 ? (
                          <Td rowSpan={item.shares.length} dataLabel="User">
                            <strong><code>{item.username}</code></strong>
                            {item.full_name && <div style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)' }}>{item.full_name}</div>}
                          </Td>
                        ) : null}
                        <Td dataLabel="Share Name">
                          <strong>[{sh.share_name}]</strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--pf-v5-global--Color--200)' }}>{sh.share_path}</div>
                        </Td>
                        <Td dataLabel="Computed Effective Access">
                          {sh.access === 'read_write' && <Label color="green">Read / Write</Label>}
                          {sh.access === 'read_only' && <Label color="orange">Read Only</Label>}
                          {sh.access === 'guest_only' && <Label color="cyan">Guest Access Only</Label>}
                          {sh.access === 'denied' && <Label color="red">Access Denied</Label>}
                        </Td>
                        <Td dataLabel="Access Rationale">
                          <span style={{ fontSize: '0.85rem' }}>{sh.reason}</span>
                        </Td>
                      </Tr>
                    ))}
                  </React.Fragment>
                ))}
                {accessMatrix.length === 0 && (
                  <Tr>
                    <Td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                      No user access data available. Add users and shares to compute permissions.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Add Samba User Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Add Samba User"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        actions={[
          <Button key="save" variant="primary" onClick={handleSaveAdd} isLoading={loading}>
            Add User
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsAddModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        <Form>
          {error && <div style={{ color: 'var(--pf-v5-global--danger-color--100)', marginBottom: 10 }}>{error}</div>}
          <FormGroup label="Unix User Account" isRequired fieldId="add-username">
            <FormSelect
              id="add-username"
              value={username}
              onChange={(_e, val) => setUsername(val)}
              aria-label="Select Unix User"
            >
              {unixUsers.map((u) => (
                <FormSelectOption key={u} value={u} label={u} />
              ))}
            </FormSelect>
            <div style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginTop: 4 }}>
              Select an existing system user account to activate in Samba.
            </div>
          </FormGroup>

          <FormGroup label="Samba Password" isRequired fieldId="add-password">
            <TextInput
              id="add-password"
              type="password"
              value={password}
              onChange={(_e, val) => setPassword(val)}
            />
          </FormGroup>

          <FormGroup label="Confirm Password" isRequired fieldId="add-confirm-password">
            <TextInput
              id="add-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(_e, val) => setConfirmPassword(val)}
            />
          </FormGroup>
        </Form>
      </Modal>

      {/* Set Password Modal */}
      <Modal
        variant={ModalVariant.small}
        title={`Set Password for [${selectedUser}]`}
        isOpen={isPasswdModalOpen}
        onClose={() => setIsPasswdModalOpen(false)}
        actions={[
          <Button key="save" variant="primary" onClick={handleSavePasswd} isLoading={loading}>
            Change Password
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsPasswdModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        <Form>
          {error && <div style={{ color: 'var(--pf-v5-global--danger-color--100)', marginBottom: 10 }}>{error}</div>}
          <FormGroup label="New Password" isRequired fieldId="pwd-password">
            <TextInput
              id="pwd-password"
              type="password"
              value={password}
              onChange={(_e, val) => setPassword(val)}
            />
          </FormGroup>
          <FormGroup label="Confirm New Password" isRequired fieldId="pwd-confirm-password">
            <TextInput
              id="pwd-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(_e, val) => setConfirmPassword(val)}
            />
          </FormGroup>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title={`Remove Samba User [${selectedUser}]?`}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="del" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete from Samba
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        Are you sure you want to remove <strong>[{selectedUser}]</strong> from the Samba passdb database? The underlying Linux user account will remain intact.
      </Modal>
    </>
  );
};
