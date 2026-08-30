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
  FolderOpenIcon,
  LockIcon,
  EllipsisVIcon,
  CheckCircleIcon,
  AppleIcon,
  PencilAltIcon,
  TrashIcon,
} from "@patternfly/react-icons";
import { SmbShare, ZfsMount } from "../types";

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
  onDeleteShare,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingShare, setEditingShare] = useState<SmbShare | null>(null);
  const [deletingShareName, setDeletingShareName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [comment, setComment] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [browseable, setBrowseable] = useState(true);
  const [guestOk, setGuestOk] = useState(false);
  const [validUsers, setValidUsers] = useState("");
  const [writeList, setWriteList] = useState("");
  const [forceUser, setForceUser] = useState("");
  const [timeMachine, setTimeMachine] = useState(false);

  const toggleDropdown = (shareName: string) => {
    setOpenDropdown(openDropdown === shareName ? null : shareName);
  };

  const handleOpenCreate = () => {
    setEditingShare(null);
    setName("");
    setPath(zfsMounts.length > 0 ? zfsMounts[0].mountpoint : "/srv/samba/share");
    setComment("");
    setReadOnly(false);
    setBrowseable(true);
    setGuestOk(false);
    setValidUsers("");
    setWriteList("");
    setForceUser("");
    setTimeMachine(false);
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (share: SmbShare) => {
    if (share.is_managed) return;
    setEditingShare(share);
    setName(share.name);
    setPath(share.path);
    setComment(share.comment || "");
    setReadOnly(share.read_only);
    setBrowseable(share.browseable);
    setGuestOk(share.guest_ok);
    setValidUsers(share.valid_users || "");
    setWriteList(share.write_list || "");
    setForceUser(share.force_user || "");
    setTimeMachine((share.vfs_objects || "").includes("fruit"));
    setError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !path.trim()) {
      setError("Share name and path are required");
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
        vfs_objects: timeMachine ? "fruit streams_xattr" : undefined,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to save share");
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
      setError(err.message || "Failed to delete share");
    } finally {
      setLoading(false);
    }
  };

  const filteredShares = shares.filter((s) =>
    s.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    s.path.toLowerCase().includes(searchValue.toLowerCase()) ||
    (s.comment && s.comment.toLowerCase().includes(searchValue.toLowerCase()))
  );

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              SMB Shares
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <SearchInput
                  placeholder="Search shares..."
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value)}
                  onClear={() => setSearchValue("")}
                  style={{ width: 260 }}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                  Create SMB share
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1.5rem" }}>
        {shares.length === 0 ? (
          <EmptyState>
            <EmptyStateHeader
              titleText="No SMB shares configured"
              icon={<EmptyStateIcon icon={FolderOpenIcon} />}
              headingLevel="h4"
            />
            <EmptyStateBody>
              Share directories with Windows, macOS, and Linux clients using Samba.
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" icon={<PlusCircleIcon />} onClick={handleOpenCreate}>
                  Create SMB share
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        ) : (
          <Card>
            <CardBody style={{ padding: 0 }}>
              <Table aria-label="SMB Shares Table">
                <Thead>
                  <Tr>
                    <Th>Share name</Th>
                    <Th>Path</Th>
                    <Th>Access</Th>
                    <Th>Permissions</Th>
                    <Th>Description</Th>
                    <Th screenReaderText="Actions" style={{ textAlign: "right", width: "80px" }} />
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredShares.map((s) => (
                    <Tr key={s.name}>
                      <Td data-label="Share name">
                        <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
                          <FlexItem>
                            <strong>[{s.name}]</strong>
                          </FlexItem>
                          {s.is_managed && (
                            <FlexItem>
                              <Tooltip content={`Managed by Ansible (${s.managed_by || "block"}). Locked as read-only.`}>
                                <Label color="blue" icon={<LockIcon />}>
                                  Ansible: {s.managed_by || "managed"}
                                </Label>
                              </Tooltip>
                            </FlexItem>
                          )}
                          {(s.vfs_objects || "").includes("fruit") && (
                            <FlexItem>
                              <Tooltip content="Apple Time Machine & macOS Fruit Extensions Enabled">
                                <Label color="grey" icon={<AppleIcon />}>Time Machine</Label>
                              </Tooltip>
                            </FlexItem>
                          )}
                        </Flex>
                      </Td>
                      <Td data-label="Path">
                        <code>{s.path || "—"}</code>
                      </Td>
                      <Td data-label="Access">
                        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                          <FlexItem>
                            {s.guest_ok ? (
                              <Label color="green">Guest / Public</Label>
                            ) : (
                              <Label color="purple">Authenticated</Label>
                            )}
                          </FlexItem>
                          {s.browseable && (
                            <FlexItem>
                              <Label color="cyan">Browseable</Label>
                            </FlexItem>
                          )}
                        </Flex>
                      </Td>
                      <Td data-label="Permissions">
                        <Label color={s.read_only ? "blue" : "green"}>
                          {s.read_only ? "Read-Only" : "Read / Write"}
                        </Label>
                        {s.valid_users && (
                          <div style={{ fontSize: "0.8rem", color: "var(--zfs-text-secondary)", marginTop: 4 }}>
                            Valid users: {s.valid_users}
                          </div>
                        )}
                      </Td>
                      <Td data-label="Description">{s.comment || "—"}</Td>
                      <Td data-label="Actions" style={{ textAlign: "right" }}>
                        {s.is_managed ? (
                          <Tooltip content="Ansible managed shares cannot be modified directly">
                            <Button variant="plain" isDisabled icon={<LockIcon />} />
                          </Tooltip>
                        ) : (
                          <Dropdown
                            popperProps={{
                              position: "right",
                              preventOverflow: true,
                              appendTo: () => document.body,
                            }}
                            isOpen={openDropdown === s.name}
                            onSelect={() => setOpenDropdown(null)}
                            onOpenChange={(isOpen) => setOpenDropdown(isOpen ? s.name : null)}
                            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                              <MenuToggle
                                ref={toggleRef}
                                aria-label="Share actions"
                                variant="plain"
                                onClick={() => toggleDropdown(s.name)}
                                isExpanded={openDropdown === s.name}
                              >
                                <EllipsisVIcon />
                              </MenuToggle>
                            )}
                          >
                            <DropdownList>
                              <DropdownItem
                                key="edit"
                                icon={<PencilAltIcon />}
                                onClick={() => handleOpenEdit(s)}
                              >
                                Edit share
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                icon={<TrashIcon />}
                                onClick={() => {
                                  setDeletingShareName(s.name);
                                  setIsDeleteModalOpen(true);
                                }}
                                style={{ color: "var(--pf-v5-global--danger-color--100)" }}
                              >
                                Delete share
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
        )}
      </PageSection>

      {/* Create / Edit Modal */}
      <Modal
        variant={ModalVariant.medium}
        title={editingShare ? `Edit SMB Share [${editingShare.name}]` : "Create SMB Share"}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSave}
            isDisabled={loading || !name.trim() || !path.trim()}
            isLoading={loading}
          >
            {editingShare ? "Save changes" : "Create share"}
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="Share Name" isRequired fieldId="smb-name">
            <TextInput
              id="smb-name"
              value={name}
              onChange={(_event, val) => setName(val)}
              placeholder="e.g. data, media, backups"
              isDisabled={!!editingShare}
              autoFocus
            />
          </FormGroup>

          <FormGroup label="Share Path" isRequired fieldId="smb-path">
            <TextInput
              id="smb-path"
              value={path}
              onChange={(_event, val) => setPath(val)}
              placeholder="/srv/samba/data"
            />
          </FormGroup>

          {zfsMounts.length > 0 && (
            <FormGroup label="Quick Pick ZFS Dataset Mount" fieldId="smb-zfs-mount">
              <FormSelect
                id="smb-zfs-mount"
                value={path}
                onChange={(_event, val) => {
                  if (val) {
                    setPath(val);
                    if (!name) setName(val.split("/").pop() || "");
                  }
                }}
              >
                <FormSelectOption value="" label="-- Choose ZFS dataset mountpoint --" />
                {zfsMounts.map((zm) => (
                  <FormSelectOption key={zm.mountpoint} value={zm.mountpoint} label={`${zm.dataset} (${zm.mountpoint})`} />
                ))}
              </FormSelect>
            </FormGroup>
          )}

          <FormGroup label="Comment / Description" fieldId="smb-comment">
            <TextInput
              id="smb-comment"
              value={comment}
              onChange={(_event, val) => setComment(val)}
              placeholder="e.g. Public Network Storage"
            />
          </FormGroup>

          <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} style={{ marginTop: "1rem" }}>
            <FlexItem>
              <Switch
                id="smb-readonly"
                label="Read-Only"
                isChecked={readOnly}
                onChange={(_event, checked) => setReadOnly(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="smb-browseable"
                label="Browseable in Network"
                isChecked={browseable}
                onChange={(_event, checked) => setBrowseable(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="smb-guest"
                label="Guest / Public Access"
                isChecked={guestOk}
                onChange={(_event, checked) => setGuestOk(checked)}
              />
            </FlexItem>
            <FlexItem>
              <Switch
                id="smb-fruit"
                label="Apple Time Machine"
                isChecked={timeMachine}
                onChange={(_event, checked) => setTimeMachine(checked)}
              />
            </FlexItem>
          </Flex>

          <FormGroup label="Valid Users (Optional)" fieldId="smb-valid-users" style={{ marginTop: "1rem" }}>
            <TextInput
              id="smb-valid-users"
              value={validUsers}
              onChange={(_event, val) => setValidUsers(val)}
              placeholder="e.g. alice, bob, @developers"
            />
          </FormGroup>

          <FormGroup label="Write List (Optional)" fieldId="smb-write-list">
            <TextInput
              id="smb-write-list"
              value={writeList}
              onChange={(_event, val) => setWriteList(val)}
              placeholder="e.g. alice, @admins"
            />
          </FormGroup>

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
        title="Delete SMB Share"
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="delete" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete share
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>,
        ]}
      >
        Are you sure you want to delete share <strong>[{deletingShareName}]</strong> from <code>/etc/samba/smb.conf</code>?
        The underlying filesystem directory will not be deleted.
      </Modal>
    </>
  );
};
