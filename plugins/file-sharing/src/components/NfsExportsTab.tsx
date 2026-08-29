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
  Tabs,
  Tab,
  TabTitleText,
  TextInput,
  Tooltip
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import {
  GlobeIcon,
  PlusCircleIcon,
  TrashIcon,
  PencilAltIcon,
  LockIcon,
  ServerIcon,
  NetworkIcon
} from '@patternfly/react-icons';
import { NfsExport, NfsClientMapItem, ZfsMount } from '../types';

interface NfsExportsTabProps {
  exports: NfsExport[];
  clientMap: NfsClientMapItem[];
  zfsMounts: ZfsMount[];
  onSaveExport: (data: { path: string; clients: any[] }) => Promise<void>;
  onDeleteExport: (path: string) => Promise<void>;
}

export const NfsExportsTab: React.FC<NfsExportsTabProps> = ({
  exports,
  clientMap,
  zfsMounts,
  onSaveExport,
  onDeleteExport
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'exports' | 'clients'>('exports');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingExport, setEditingExport] = useState<NfsExport | null>(null);
  const [deletingPath, setDeletingPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [path, setPath] = useState('');
  const [clientHost, setClientHost] = useState('*');
  const [readOnly, setReadOnly] = useState(false);
  const [sync, setSync] = useState(true);
  const [rootSquash, setRootSquash] = useState(true);
  const [noSubtreeCheck, setNoSubtreeCheck] = useState(true);

  const handleOpenCreate = () => {
    setEditingExport(null);
    setPath(zfsMounts.length > 0 ? zfsMounts[0].mountpoint : '/srv/nfs/share');
    setClientHost('*');
    setReadOnly(false);
    setSync(true);
    setRootSquash(true);
    setNoSubtreeCheck(true);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (exp: NfsExport) => {
    if (exp.is_managed) return;
    setEditingExport(exp);
    setPath(exp.path);
    const firstClient = exp.clients[0] || { host: '*' };
    setClientHost(firstClient.host);
    setReadOnly(firstClient.read_only);
    setSync(firstClient.sync);
    setRootSquash(firstClient.root_squash);
    setNoSubtreeCheck(firstClient.no_subtree_check);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!path.trim()) {
      setError('Export path is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSaveExport({
        path: path.trim(),
        clients: [
          {
            host: clientHost.trim() || '*',
            read_only: readOnly,
            sync: sync,
            root_squash: rootSquash,
            all_squash: false,
            no_subtree_check: noSubtreeCheck
          }
        ]
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save NFS export');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPath) return;
    setLoading(true);
    try {
      await onDeleteExport(deletingPath);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete NFS export');
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
                <GlobeIcon style={{ marginRight: 8 }} />
                NFS Exports & Access Management
              </CardTitle>
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                Create NFS Export
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
            <Tab eventKey="exports" title={<TabTitleText><ServerIcon style={{ marginRight: 6 }} />Export Paths ({exports.length})</TabTitleText>} />
            <Tab eventKey="clients" title={<TabTitleText><NetworkIcon style={{ marginRight: 6 }} />Client IP Access Map ({clientMap.length})</TabTitleText>} />
          </Tabs>

          {activeSubTab === 'exports' && (
            <Table aria-label="NFS Exports Table" variant="compact">
              <Thead>
                <Tr>
                  <Th>Export Path</Th>
                  <Th>Allowed Clients</Th>
                  <Th>Options</Th>
                  <Th>Config File</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {exports.map((exp) => (
                  <Tr key={exp.path}>
                    <Td dataLabel="Export Path">
                      <Flex alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                          <strong><code>{exp.path}</code></strong>
                        </FlexItem>
                        {exp.is_managed && (
                          <FlexItem>
                            <Tooltip content={`Managed by Ansible (${exp.managed_by || 'config block'}). Read-only in Cockpit.`}>
                              <Label color="blue" icon={<LockIcon />}>
                                Ansible: {exp.managed_by || 'managed'}
                              </Label>
                            </Tooltip>
                          </FlexItem>
                        )}
                      </Flex>
                    </Td>
                    <Td dataLabel="Allowed Clients">
                      <Flex spaceItems={{ default: 'spaceItemsXs' }}>
                        {exp.clients.map((c, idx) => (
                          <FlexItem key={idx}>
                            <Label color={c.host === '*' ? 'grey' : 'cyan'}>
                              {c.host} ({c.read_only ? 'ro' : 'rw'})
                            </Label>
                          </FlexItem>
                        ))}
                      </Flex>
                    </Td>
                    <Td dataLabel="Options">
                      {exp.clients[0]?.sync ? <Label color="green">sync</Label> : <Label color="orange">async</Label>}
                      {exp.clients[0]?.root_squash ? (
                        <Label color="blue" style={{ marginLeft: 4 }}>root_squash</Label>
                      ) : (
                        <Label color="red" style={{ marginLeft: 4 }}>no_root_squash</Label>
                      )}
                    </Td>
                    <Td dataLabel="Config File">
                      <code style={{ fontSize: '0.85rem' }}>{exp.file || '/etc/exports'}</code>
                    </Td>
                    <Td dataLabel="Actions" style={{ textAlign: 'right' }}>
                      {exp.is_managed ? (
                        <Tooltip content="Ansible managed exports cannot be modified through Cockpit">
                          <Button variant="plain" isDisabled icon={<LockIcon />} />
                        </Tooltip>
                      ) : (
                        <>
                          <Button
                            variant="plain"
                            icon={<PencilAltIcon />}
                            onClick={() => handleOpenEdit(exp)}
                            title="Edit NFS export"
                          />
                          <Button
                            variant="plain"
                            icon={<TrashIcon />}
                            onClick={() => {
                              setDeletingPath(exp.path);
                              setIsDeleteModalOpen(true);
                            }}
                            title="Delete NFS export"
                          />
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
                {exports.length === 0 && (
                  <Tr>
                    <Td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                      No NFS exports found. Click "Create NFS Export" to define an export.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          )}

          {activeSubTab === 'clients' && (
            <Table aria-label="NFS Client Access Map" variant="compact">
              <Thead>
                <Tr>
                  <Th>Client / Subnet</Th>
                  <Th>Accessible Exports</Th>
                  <Th>Mount Permissions</Th>
                  <Th>Flags</Th>
                </Tr>
              </Thead>
              <Tbody>
                {clientMap.map((cm) => (
                  <Tr key={cm.client}>
                    <Td dataLabel="Client / Subnet">
                      <strong>
                        <Label color={cm.client === '*' ? 'grey' : 'cyan'}>
                          <NetworkIcon style={{ marginRight: 4 }} />
                          {cm.client === '*' ? 'Any Host (*)' : cm.client}
                        </Label>
                      </strong>
                    </Td>
                    <Td dataLabel="Accessible Exports">
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        {cm.exports.map((e, idx) => (
                          <FlexItem key={idx}>
                            <code>{e.path}</code>
                            {e.is_managed && (
                              <Label color="blue" icon={<LockIcon />} style={{ marginLeft: 6, fontSize: '0.75rem' }}>
                                {e.managed_by || 'Ansible'}
                              </Label>
                            )}
                          </FlexItem>
                        ))}
                      </Flex>
                    </Td>
                    <Td dataLabel="Mount Permissions">
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        {cm.exports.map((e, idx) => (
                          <FlexItem key={idx}>
                            {e.read_only ? (
                              <Label color="orange">Read Only (ro)</Label>
                            ) : (
                              <Label color="green">Read / Write (rw)</Label>
                            )}
                          </FlexItem>
                        ))}
                      </Flex>
                    </Td>
                    <Td dataLabel="Flags">
                      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                        {cm.exports.map((e, idx) => (
                          <FlexItem key={idx}>
                            <Label color="grey" style={{ fontSize: '0.75rem' }}>
                              {e.options.join(', ')}
                            </Label>
                          </FlexItem>
                        ))}
                      </Flex>
                    </Td>
                  </Tr>
                ))}
                {clientMap.length === 0 && (
                  <Tr>
                    <Td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                      No client access mappings available.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Create / Edit Export Modal */}
      <Modal
        variant={ModalVariant.medium}
        title={editingExport ? `Edit NFS Export: ${editingExport.path}` : 'Create NFS Export'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={[
          <Button key="save" variant="primary" onClick={handleSave} isLoading={loading}>
            Save Export
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        <Form>
          {error && <div style={{ color: 'var(--pf-v5-global--danger-color--100)', marginBottom: 10 }}>{error}</div>}
          <FormGroup label="Export Directory Path" isRequired fieldId="nfs-path">
            <TextInput
              id="nfs-path"
              value={path}
              onChange={(_e, val) => setPath(val)}
              isDisabled={!!editingExport}
              placeholder="/srv/nfs/share or /tank/dataset"
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

          <FormGroup label="Allowed Client(s) or Subnet" isRequired fieldId="nfs-client">
            <TextInput
              id="nfs-client"
              value={clientHost}
              onChange={(_e, val) => setClientHost(val)}
              placeholder="* or 192.168.1.0/24 or 10.0.0.5"
            />
            <div style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginTop: 4 }}>
              Use <code>*</code> for all clients, or an IP / CIDR network address.
            </div>
          </FormGroup>

          <Flex spaceItems={{ default: 'spaceItemsLg' }}>
            <FlexItem>
              <Switch
                id="nfs-read-only"
                label="Read Only (ro)"
                isChecked={readOnly}
                onChange={(_e, checked) => setReadOnly(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-sync"
                label="Synchronous Write (sync)"
                isChecked={sync}
                onChange={(_e, checked) => setSync(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-root-squash"
                label="Root Squash (Map root to nobody)"
                isChecked={rootSquash}
                onChange={(_e, checked) => setRootSquash(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-no-subtree"
                label="No Subtree Check"
                isChecked={noSubtreeCheck}
                onChange={(_e, checked) => setNoSubtreeCheck(checked)}
              />
            </FlexItem>
          </Flex>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete NFS Export?"
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="del" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete Export
          </Button>,
          <Button key="cancel" variant="link" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
        ]}
      >
        Are you sure you want to delete the NFS export for <code>{deletingPath}</code> from <code>/etc/exports.d/cockpit.exports</code>?
      </Modal>
    </>
  );
};
