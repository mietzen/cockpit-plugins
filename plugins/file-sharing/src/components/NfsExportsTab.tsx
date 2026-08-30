import React, { useState } from "react";
import {
  PageSection,
  Title,
  Button,
  Flex,
  FlexItem,
  Card,
  CardBody,
  Label,
  SearchInput,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Tabs,
  Tab,
  TabTitleText,
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  MenuToggleElement,
  Modal,
  ModalVariant,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Switch,
  Tooltip,
  Alert,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import {
  PlusCircleIcon,
  GlobeIcon,
  NetworkIcon,
  LockIcon,
  EllipsisVIcon,
  PencilAltIcon,
  TrashIcon,
} from "@patternfly/react-icons";
import { NfsExport, NfsClientMapItem, ZfsMount } from "../types";

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
  onDeleteExport,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"exports" | "clients">("exports");
  const [searchValue, setSearchValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingExport, setEditingExport] = useState<NfsExport | null>(null);
  const [deletingPath, setDeletingPath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [path, setPath] = useState("");
  const [clientHost, setClientHost] = useState("*");
  const [readOnly, setReadOnly] = useState(false);
  const [sync, setSync] = useState(true);
  const [rootSquash, setRootSquash] = useState(true);
  const [noSubtreeCheck, setNoSubtreeCheck] = useState(true);

  const toggleDropdown = (exportPath: string) => {
    setOpenDropdown(openDropdown === exportPath ? null : exportPath);
  };

  const handleOpenCreate = () => {
    setEditingExport(null);
    setPath(zfsMounts.length > 0 ? zfsMounts[0].mountpoint : "/srv/nfs/share");
    setClientHost("*");
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
    const firstClient = exp.clients[0] || { host: "*", read_only: false, sync: true, root_squash: true, no_subtree_check: true };
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
      setError("Export path is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSaveExport({
        path: path.trim(),
        clients: [
          {
            host: clientHost.trim() || "*",
            read_only: readOnly,
            sync: sync,
            root_squash: rootSquash,
            no_subtree_check: noSubtreeCheck,
          },
        ],
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to save export");
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
      setError(err.message || "Failed to delete export");
    } finally {
      setLoading(false);
    }
  };

  const filteredExports = exports.filter((e) =>
    e.path.toLowerCase().includes(searchValue.toLowerCase()) ||
    e.clients.some((c) => c.host.toLowerCase().includes(searchValue.toLowerCase()))
  );

  const filteredClientMap = clientMap.filter((c) =>
    c.client.toLowerCase().includes(searchValue.toLowerCase()) ||
    c.exports.some((e) => e.path.toLowerCase().includes(searchValue.toLowerCase()))
  );

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              NFS Exports
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <SearchInput
                  placeholder="Search NFS exports..."
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value)}
                  onClear={() => setSearchValue("")}
                  style={{ width: 260 }}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                  Create NFS export
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1rem" }}>
        <Tabs
          activeKey={activeSubTab}
          onSelect={(_event, tabKey) => setActiveSubTab(tabKey as "exports" | "clients")}
          style={{ marginBottom: "1.5rem" }}
        >
          <Tab eventKey="exports" title={<TabTitleText>Export Paths ({exports.length})</TabTitleText>} />
          <Tab eventKey="clients" title={<TabTitleText>Client IP Access Map ({clientMap.length})</TabTitleText>} />
        </Tabs>

        {activeSubTab === "exports" ? (
          exports.length === 0 ? (
            <EmptyState>
              <EmptyStateHeader
                titleText="No NFS exports configured"
                icon={<EmptyStateIcon icon={GlobeIcon} />}
                headingLevel="h4"
              />
              <EmptyStateBody>
                Export filesystems and ZFS datasets to network clients using NFS.
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                    Create NFS export
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <Card>
              <CardBody style={{ padding: 0 }}>
                <Table aria-label="NFS Exports Table">
                  <Thead>
                    <Tr>
                      <Th>Export path</Th>
                      <Th>Allowed clients &amp; networks</Th>
                      <Th>Configuration file</Th>
                      <Th>Status</Th>
                      <Th screenReaderText="Actions" style={{ textAlign: "right", width: "80px" }} />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filteredExports.map((exp) => (
                      <Tr key={exp.path}>
                        <Td data-label="Export path">
                          <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
                            <FlexItem>
                              <strong><code>{exp.path}</code></strong>
                            </FlexItem>
                            {exp.is_managed && (
                              <FlexItem>
                                <Tooltip content={`Managed by Ansible (${exp.managed_by || "block"}). Read-only.`}>
                                  <Label color="blue" icon={<LockIcon />}>
                                    Ansible: {exp.managed_by || "managed"}
                                  </Label>
                                </Tooltip>
                              </FlexItem>
                            )}
                          </Flex>
                        </Td>
                        <Td data-label="Allowed clients">
                          <Flex wrap={{ default: "wrap" }} gap={{ default: "gapSm" }}>
                            {exp.clients.map((c, i) => (
                              <FlexItem key={i}>
                                <Label color={c.read_only ? "blue" : "green"}>
                                  {c.host} ({c.read_only ? "ro" : "rw"})
                                </Label>
                              </FlexItem>
                            ))}
                          </Flex>
                        </Td>
                        <Td data-label="Configuration file">
                          <span style={{ fontSize: "0.85rem", color: "var(--zfs-text-secondary)" }}>
                            {exp.file || "/etc/exports.d/cockpit.exports"}
                          </span>
                        </Td>
                        <Td data-label="Status">
                          <Label color="green">Active</Label>
                        </Td>
                        <Td data-label="Actions" style={{ textAlign: "right" }}>
                          {exp.is_managed ? (
                            <Tooltip content="Ansible managed exports cannot be modified directly">
                              <Button variant="plain" isDisabled icon={<LockIcon />} />
                            </Tooltip>
                          ) : (
                            <Dropdown
                              popperProps={{
                                position: "right",
                                preventOverflow: true,
                                appendTo: () => document.body,
                              }}
                              isOpen={openDropdown === exp.path}
                              onSelect={() => setOpenDropdown(null)}
                              onOpenChange={(isOpen) => setOpenDropdown(isOpen ? exp.path : null)}
                              toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                  ref={toggleRef}
                                  aria-label="Export actions"
                                  variant="plain"
                                  onClick={() => toggleDropdown(exp.path)}
                                  isExpanded={openDropdown === exp.path}
                                >
                                  <EllipsisVIcon />
                                </MenuToggle>
                              )}
                            >
                              <DropdownList>
                                <DropdownItem
                                  key="edit"
                                  icon={<PencilAltIcon />}
                                  onClick={() => handleOpenEdit(exp)}
                                >
                                  Edit export
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  icon={<TrashIcon />}
                                  onClick={() => {
                                    setDeletingPath(exp.path);
                                    setIsDeleteModalOpen(true);
                                  }}
                                  style={{ color: "var(--pf-v5-global--danger-color--100)" }}
                                >
                                  Delete export
                                </DropdownItem>
                              </DropdownList>
                            </Dropdown>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          )
        ) : (
          <Card>
            <CardBody style={{ padding: 0 }}>
              <Table aria-label="Client IP Access Map Table">
                <Thead>
                  <Tr>
                    <Th>Client Host / Network Subnet</Th>
                    <Th>Accessible Exports</Th>
                    <Th>Mount Options</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredClientMap.map((cm) => (
                    <Tr key={cm.client}>
                      <Td data-label="Client Host / Subnet">
                        <strong><NetworkIcon style={{ marginRight: 8, color: "var(--zfs-tab-active-color)" }} />{cm.client}</strong>
                      </Td>
                      <Td data-label="Accessible Exports">
                        <Flex direction={{ default: "column" }} gap={{ default: "gapXs" }}>
                          {cm.exports.map((e, idx) => (
                            <FlexItem key={idx}>
                              <code>{e.path}</code>
                              <Label color={e.read_only ? "blue" : "green"} style={{ marginLeft: 8 }}>
                                {e.read_only ? "Read-Only" : "Read / Write"}
                              </Label>
                            </FlexItem>
                          ))}
                        </Flex>
                      </Td>
                      <Td data-label="Mount Options">
                        <span style={{ fontSize: "0.85rem", color: "var(--zfs-text-secondary)" }}>
                          {cm.exports.map((e) => (e.options || []).join(", ")).join("; ")}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                  {filteredClientMap.length === 0 && (
                    <Tr>
                      <Td colSpan={3} style={{ textAlign: "center", padding: "2rem", color: "var(--zfs-text-secondary)" }}>
                        No client networks matching search criteria.
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        )}
      </PageSection>

      {/* Create / Edit Export Modal */}
      <Modal
        variant={ModalVariant.medium}
        title={editingExport ? `Edit NFS Export for ${editingExport.path}` : "Create NFS Export"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSave}
            isDisabled={loading || !path.trim()}
            isLoading={loading}
          >
            {editingExport ? "Save changes" : "Create export"}
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="Export Path" isRequired fieldId="nfs-path">
            <TextInput
              id="nfs-path"
              value={path}
              onChange={(_event, val) => setPath(val)}
              placeholder="/srv/nfs/data"
              isDisabled={!!editingExport}
              autoFocus
            />
          </FormGroup>

          {zfsMounts.length > 0 && !editingExport && (
            <FormGroup label="Quick Pick ZFS Dataset Mount" fieldId="nfs-zfs-mount">
              <FormSelect
                id="nfs-zfs-mount"
                value={path}
                onChange={(_event, val) => val && setPath(val)}
              >
                <FormSelectOption value="" label="-- Choose ZFS dataset mountpoint --" />
                {zfsMounts.map((zm) => (
                  <FormSelectOption key={zm.mountpoint} value={zm.mountpoint} label={`${zm.dataset} (${zm.mountpoint})`} />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          <FormGroup label="Allowed Client / IP Subnet" isRequired fieldId="nfs-client">
            <TextInput
              id="nfs-client"
              value={clientHost}
              onChange={(_event, val) => setClientHost(val)}
              placeholder="e.g. 192.168.1.0/24, 10.0.0.5, or * for all"
            />
          </FormGroup>

          <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} style={{ marginTop: "1rem" }}>
            <FlexItem>
              <Switch
                id="nfs-readonly"
                label="Read-Only (ro)"
                isChecked={readOnly}
                onChange={(_event, checked) => setReadOnly(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-sync"
                label="Synchronous Writes (sync)"
                isChecked={sync}
                onChange={(_event, checked) => setSync(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-squash"
                label="Root Squash (root_squash)"
                isChecked={rootSquash}
                onChange={(_event, checked) => setRootSquash(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="nfs-subtree"
                label="No Subtree Check"
                isChecked={noSubtreeCheck}
                onChange={(_event, checked) => setNoSubtreeCheck(checked)}
              />
            </FlexItem>
          </Flex>

          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
              {error}
            </Alert>
          )}
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete NFS Export"
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="delete" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete export
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>,
        ]}
      >
        Are you sure you want to remove the NFS export for <code>{deletingPath}</code>?
        The directory contents on the server will not be deleted.
      </Modal>
    </>
  );
};
