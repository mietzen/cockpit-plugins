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
  Switch,
  TextInput,
  Tooltip
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import {
  LockIcon,
  PlusCircleIcon,
  FolderIcon,
  FolderOpenIcon,
  TrashIcon,
  PencilAltIcon,
  AppleIcon
} from '@patternfly/react-icons';
import { SmbShare, ZfsMount } from '../types';

interface SmbSharesTabProps {
  shares: SmbShare[];
  zfsMounts: ZfsMount[];
  onSaveShare: (share: Partial<SmbShare>) => Promise<void>;
  onDeleteShare: (name: string) => Promise<void>;
}

export const SmbSharesTab: React.FC<SmbSharesTabProps> = ({
  shares,
  zfsMounts,
  onSaveShare,
  onDeleteShare
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<SmbShare | null>(null);
  const [deletingShareName, setDeletingShareName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [comment, setComment] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [browseable, setBrowseable] = useState(true);
  const [guestOk, setGuestOk] = useState(false);
  const [validUsers, setValidUsers] = useState('');
  const [writeList, setWriteList] = useState('');
  const [forceUser, setForceUser] = useState('');
  const [timeMachine, setTimeMachine] = useState(false);

  const handleOpenCreate = () => {
    setEditingShare(null);
    setName('');
    setPath(zfsMounts.length > 0 ? zfsMounts[0].mountpoint : '/srv/samba/share');
    setComment('');
    setReadOnly(false);
    setBrowseable(true);
    setGuestOk(false);
    setValidUsers('');
    setWriteList('');
    setForceUser('');
    setTimeMachine(false);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (share: SmbShare) => {
    if (share.is_managed) return;
    setEditingShare(share);
    setName(share.name);
    setPath(share.path);
    setComment(share.comment || '');
    setReadOnly(share.read_only);
    setBrowseable(share.browseable);
    setGuestOk(share.guest_ok);
    setValidUsers(share.valid_users || '');
    setWriteList(share.write_list || '');
    setForceUser(share.force_user || '');
    setTimeMachine((share.vfs_objects || '').includes('fruit'));
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !path.trim()) {
      setError('Share name and path are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSaveShare({
        name: name.trim(),
        path: path.trim(),
        comment: comment.trim(),
        read_only: readOnly,
        browseable: browseable,
        guest_ok: guestOk,
        valid_users: validUsers.trim() || undefined,
        write_list: writeList.trim() || undefined,
        force_user: forceUser.trim() || undefined,
        vfs_objects: timeMachine ? 'fruit streams_xattr' : undefined
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save share');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingShareName) return;
    setLoading(true);
    try {
      await onDeleteShare(deletingShareName);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete share');
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
                <FolderIcon style={{ marginRight: 8 }} />
                Samba (SMB) Shares ({shares.length})
              </CardTitle>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                Create SMB Share
              </Button>
            </FlexItem>
          </Flex>
        </CardHeader>
        <CardBody>
          <Table aria-label="SMB Shares Table" variant="compact">
            <Thead>
              <Tr>
                <Th>Share Name</Th>
                <Th>Path</Th>
                <Th>Access</Th>
                <Th>Permissions</Th>
                <Th>Description</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {shares.map((s) => (
                <Tr key={s.name}>
                  <Td dataLabel="Share Name">
                    <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                      <FlexItem>
                        <strong>{s.name}</strong>
                      </FlexItem>
                      {s.is_managed && (
                        <FlexItem>
                          <Tooltip content={`Managed by Ansible (${s.managed_by || 'config block'}). Read-only in Cockpit.`}>
                            <Label color="blue" icon={<LockIcon />}>
                              Ansible: {s.managed_by || 'managed'}
                            </Label>
                          </Tooltip>
                        </FlexItem>
                      )}
                      {(s.vfs_objects || '').includes('fruit') && (
                        <FlexItem>
                          <Tooltip content="Apple Time Machine & macOS Fruit Extensions Enabled">
                            <Label color="grey" icon={<AppleIcon />}>Time Machine</Label>
                          </Tooltip>
                        </FlexItem>
                      )}
                    </Flex>
                  </Td>
                  <Td dataLabel="Path">
                    <code>{s.path}</code>
                  </Td>
                  <Td dataLabel="Access">
                    {s.guest_ok ? (
                      <Label color="green">Guest / Public</Label>
                    ) : (
                      <Label color="purple">Authenticated</Label>
                    )}
                    {s.browseable && <Label color="cyan" style={{ marginLeft: 4 }}>Browseable</Label>}
                  </Td>
                  <Td dataLabel="Permissions">
                    {s.read_only ? (
                      <Label color="orange">Read Only</Label>
                    ) : (
                      <Label color="green">Read / Write</Label>
                    )}
                    {s.valid_users && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginTop: 2 }}>
                        Users: {s.valid_users}
                      </div>
                    )}
                  </Td>
                  <Td dataLabel="Description">{s.comment || '-'}</Td>
                  <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                    {s.is_managed ? (
                      <Tooltip content="Ansible managed blocks cannot be modified through Cockpit">
                        <Button variant="plain" isDisabled icon={<LockIcon />} />
                      </Tooltip>
                    ) : (
                      <>
                        <Button
                          variant="plain"
                          icon={<PencilAltIcon />}
                          onClick={() => handleOpenEdit(s)}
                          title="Edit share"
                        />
                        <Button
                          variant="plain"
                          icon={<TrashIcon />}
                          onClick={() => {
                            setDeletingShareName(s.name);
                            setIsDeleteModalOpen(true);
                          }}
                          title="Delete share"
                        />
                      </>
                    )}
                  </Td>
                </Tr>
              ))}
              {shares.length === 0 && (
                <Tr>
                  <Td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    No SMB shares configured. Click "Create SMB Share" to add one.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {/* Create / Edit Share Modal */}
      <Modal
        variant={ModalVariant.medium}
        title={editingShare ? `Edit SMB Share: [${editingShare.name}]` : 'Create SMB Share'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={[
          <Button key="save" variant="primary" onClick={handleSave} isLoading={loading}>
            Save Share
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        <Form>
          {error && <div style={{ color: 'var(--pf-v5-global--danger-color--100)', marginBottom: 10 }}>{error}</div>}
          <FormGroup label="Share Name" isRequired fieldId="share-name">
            <TextInput
              id="share-name"
              value={name}
              onChange={(_e, val) => setName(val)}
              isDisabled={!!editingShare}
              placeholder="e.g. data, media, backups"
            />
          </FormGroup>

          <FormGroup label="Folder Path" isRequired fieldId="share-path">
            <TextInput
              id="share-path"
              value={path}
              onChange={(_e, val) => setPath(val)}
              placeholder="/srv/samba/share or /tank/dataset"
            />
            {zfsMounts.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginRight: 6 }}>
                  Quick-pick ZFS Dataset:
                </span>
                <FormSelect
                  value=""
                  onChange={(_e, val) => {
                    if (val) setPath(val);
                  }}
                  aria-label="Select ZFS Dataset"
                  style={{ width: 'auto', display: 'inline-block' }}
                >
                  <FormSelectOption key="none" value="" label="-- Choose ZFS Mountpoint --" />
                  {zfsMounts.map((z) => (
                    <FormSelectOption key={z.dataset} value={z.mountpoint} label={`${z.dataset} (${z.mountpoint})`} />
                  ))}
                </FormSelect>
              </div>
            )}
          </FormGroup>

          <FormGroup label="Comment / Description" fieldId="share-comment">
            <TextInput
              id="share-comment"
              value={comment}
              onChange={(_e, val) => setComment(val)}
              placeholder="Description of the share"
            />
          </FormGroup>

          <Flex spaceItems={{ default: 'spaceItemsLg' }}>
            <FlexItem>
              <Switch
                id="share-read-only"
                label="Read Only"
                isChecked={readOnly}
                onChange={(_e, checked) => setReadOnly(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="share-browseable"
                label="Browseable"
                isChecked={browseable}
                onChange={(_e, checked) => setBrowseable(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="share-guest-ok"
                label="Allow Guest Access"
                isChecked={guestOk}
                onChange={(_e, checked) => setGuestOk(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="share-timemachine"
                label="Apple Time Machine (macOS VFS)"
                isChecked={timeMachine}
                onChange={(_e, checked) => setTimeMachine(checked)}
              />
            </FlexItem>
          </Flex>

          <FormGroup label="Valid Users (Comma or space separated)" fieldId="share-valid-users">
            <TextInput
              id="share-valid-users"
              value={validUsers}
              onChange={(_e, val) => setValidUsers(val)}
              placeholder="e.g. alice, bob, @admins (leave empty for all users)"
            />
          </FormGroup>

          <FormGroup label="Write List (Override read-only for specific users)" fieldId="share-write-list">
            <TextInput
              id="share-write-list"
              value={writeList}
              onChange={(_e, val) => setWriteList(val)}
              placeholder="e.g. alice, @wheel"
            />
          </FormGroup>

          <FormGroup label="Force User (Optional Unix account)" fieldId="share-force-user">
            <TextInput
              id="share-force-user"
              value={forceUser}
              onChange={(_e, val) => setForceUser(val)}
              placeholder="e.g. www-data or debian"
            />
          </FormGroup>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title={`Delete SMB Share [${deletingShareName}]?`}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="del" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete Share
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        Are you sure you want to delete the SMB share <strong>[{deletingShareName}]</strong> from <code>/etc/samba/smb.conf</code>? The files on disk will remain untouched.
      </Modal>
    </>
  );
};
