import React, { useState, useEffect } from "react";
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
  Checkbox,
  Alert,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td, ThProps } from "@patternfly/react-table";
import {
  UserPlusIcon,
  UsersIcon,
  CheckCircleIcon,
  BanIcon,
  EllipsisVIcon,
  KeyIcon,
  TrashIcon,
  UserIcon,
  PencilAltIcon,
} from "@patternfly/react-icons";
import { SmbUser, SmbGroup, UserAccessMatrixItem } from "../types";

interface UsersTabProps {
  users: SmbUser[];
  groups?: SmbGroup[];
  unixUsers: string[];
  accessMatrix: UserAccessMatrixItem[];
  onCreateUser: (username: string, password: string) => Promise<void>;
  onSetPassword: (username: string, password: string) => Promise<void>;
  onSetState: (username: string, enable: boolean) => Promise<void>;
  onDeleteUser: (username: string) => Promise<void>;
  onCreateGroup?: (name: string, members: string[]) => Promise<void>;
  onModifyGroup?: (name: string, newName?: string, members?: string[]) => Promise<void>;
  onDeleteGroup?: (name: string) => Promise<void>;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  groups = [],
  unixUsers,
  accessMatrix,
  onCreateUser,
  onSetPassword,
  onSetState,
  onDeleteUser,
  onCreateGroup,
  onModifyGroup,
  onDeleteGroup,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"users" | "groups" | "matrix">("users");
  const [searchValue, setSearchValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // User modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswdModalOpen, setIsPasswdModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Group modal states
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);
  const [isDeleteGroupModalOpen, setIsDeleteGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<SmbGroup | null>(null);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);

  // Sorting states
  const [userSortIndex, setUserSortIndex] = useState<number | null>(0);
  const [userSortDirection, setUserSortDirection] = useState<'asc' | 'desc'>('asc');

  const [groupSortIndex, setGroupSortIndex] = useState<number | null>(0);
  const [groupSortDirection, setGroupSortDirection] = useState<'asc' | 'desc'>('asc');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDropdown = (id: string) => {
    setOpenDropdown(openDropdown === id ? null : id);
  };

  const getUserSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: userSortIndex ?? undefined,
      direction: userSortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setUserSortIndex(index);
      setUserSortDirection(direction);
    },
    columnIndex,
  });

  const getGroupSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: groupSortIndex ?? undefined,
      direction: groupSortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      setGroupSortIndex(index);
      setGroupSortDirection(direction);
    },
    columnIndex,
  });

  const handleOpenAdd = () => {
    setUsername(unixUsers.length > 0 ? unixUsers[0] : "");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenPasswd = (u: string) => {
    setSelectedUser(u);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setIsPasswdModalOpen(true);
  };

  const handleOpenAddGroup = () => {
    setGroupName("");
    setGroupMembers([]);
    setError(null);
    setIsAddGroupModalOpen(true);
  };

  const handleOpenEditGroup = (grp: SmbGroup) => {
    setSelectedGroup(grp);
    setGroupName(grp.name);
    setGroupMembers([...grp.members]);
    setError(null);
    setIsEditGroupModalOpen(true);
  };

  const handleOpenDeleteGroup = (grp: SmbGroup) => {
    setSelectedGroup(grp);
    setError(null);
    setIsDeleteGroupModalOpen(true);
  };

  const handleSaveAdd = async () => {
    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (!password) {
      setError("Password cannot be empty");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onCreateUser(username.trim(), password);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to add Samba user");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePasswd = async () => {
    if (!password) {
      setError("Password cannot be empty");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSetPassword(selectedUser, password);
      setIsPasswdModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) {
      return;
    }
    setLoading(true);
    try {
      await onDeleteUser(selectedUser);
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAddGroup = async () => {
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }
    if (!onCreateGroup) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onCreateGroup(groupName.trim(), groupMembers);
      setIsAddGroupModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to create SMB group");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEditGroup = async () => {
    if (!groupName.trim() || !selectedGroup) {
      setError("Group name is required");
      return;
    }
    if (!onModifyGroup) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onModifyGroup(selectedGroup.name, groupName.trim(), groupMembers);
      setIsEditGroupModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to update SMB group");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroupAction = async () => {
    if (!selectedGroup || !onDeleteGroup) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onDeleteGroup(selectedGroup.name);
      setIsDeleteGroupModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Failed to delete group");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__usersTabHandlers = {
        openAdd: handleOpenAdd,
        openPasswd: handleOpenPasswd,
        openDelete: (u: string) => { setSelectedUser(u); setIsDeleteModalOpen(true); },
        saveAdd: handleSaveAdd,
        savePasswd: handleSavePasswd,
        deleteUser: handleDelete,
        setSubTab: setActiveSubTab,
      };
    }
  });

  const allAvailableUsers = Array.from(new Set([...unixUsers, ...users.map((u) => u.username)])).sort();

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchValue.toLowerCase()) ||
    (u.full_name && u.full_name.toLowerCase().includes(searchValue.toLowerCase())) ||
    (u.sid && u.sid.toLowerCase().includes(searchValue.toLowerCase()))
  );

  const sortedUsers = React.useMemo(() => {
    if (userSortIndex === null) {
      return filteredUsers;
    }
    return [...filteredUsers].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (userSortIndex === 0) {
        aVal = a.username;
        bVal = b.username;
      } else if (userSortIndex === 1) {
        aVal = a.full_name || '';
        bVal = b.full_name || '';
      } else if (userSortIndex === 2) {
        aVal = a.is_enabled ? 'Enabled' : 'Disabled';
        bVal = b.is_enabled ? 'Enabled' : 'Disabled';
      } else if (userSortIndex === 3) {
        aVal = a.sid || '';
        bVal = b.sid || '';
      } else if (userSortIndex === 4) {
        aVal = (a.groups || []).join(', ');
        bVal = (b.groups || []).join(', ');
      }
      return userSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [filteredUsers, userSortIndex, userSortDirection]);

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    g.members.some((m) => m.toLowerCase().includes(searchValue.toLowerCase()))
  );

  const sortedGroups = React.useMemo(() => {
    if (groupSortIndex === null) {
      return filteredGroups;
    }
    return [...filteredGroups].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (groupSortIndex === 0) {
        aVal = a.name;
        bVal = b.name;
      } else if (groupSortIndex === 1) {
        return groupSortDirection === 'asc' ? a.gid - b.gid : b.gid - a.gid;
      } else if (groupSortIndex === 2) {
        aVal = a.members.join(', ');
        bVal = b.members.join(', ');
      }
      return groupSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [filteredGroups, groupSortIndex, groupSortDirection]);

  const filteredMatrix = accessMatrix.filter((m) =>
    m.username.toLowerCase().includes(searchValue.toLowerCase())
  );

  const allShareNames = Array.from(
    new Set(accessMatrix.flatMap((m) => m.shares.map((s) => s.share_name)))
  );

  return (
    <>
      <PageSection variant="light" style={{ paddingBottom: "1rem" }}>
        <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Title headingLevel="h1" size="2xl" style={{ fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
              Samba Users &amp; Permissions
            </Title>
          </FlexItem>
          <FlexItem>
            <Flex alignItems={{ default: "alignItemsCenter" }} gap={{ default: "gapSm" }}>
              <FlexItem>
                <SearchInput
                  placeholder="Search users &amp; groups..."
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value)}
                  onClear={() => setSearchValue("")}
                  style={{ width: 260 }}
                />
              </FlexItem>
              <FlexItem>
                {activeSubTab === "groups" ? (
                  <Button variant="primary" icon={<UsersIcon />} onClick={handleOpenAddGroup}>
                    Add SMB Group
                  </Button>
                ) : (
                  <Button variant="primary" icon={<UserPlusIcon />} onClick={handleOpenAdd}>
                    Add SMB User
                  </Button>
                )}
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1rem" }}>
        <Tabs
          activeKey={activeSubTab}
          onSelect={(_event, tabKey) => setActiveSubTab(tabKey as "users" | "groups" | "matrix")}
          style={{ marginBottom: "1.5rem" }}
        >
          <Tab eventKey="users" title={<TabTitleText>Samba Users ({users.length})</TabTitleText>} />
          <Tab eventKey="groups" title={<TabTitleText>Samba Groups ({groups.length})</TabTitleText>} />
          <Tab eventKey="matrix" title={<TabTitleText>User Access Matrix</TabTitleText>} />
        </Tabs>

        <div style={{ display: activeSubTab === "users" ? "block" : "none" }}>
          {users.length === 0 ? (
            <EmptyState>
              <EmptyStateHeader
                titleText="No Samba users configured"
                icon={<EmptyStateIcon icon={UsersIcon} />}
                headingLevel="h4"
              />
              <EmptyStateBody>
                Add system Unix users to the Samba passdb to allow authenticated access.
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" icon={<UserPlusIcon />} onClick={handleOpenAdd}>
                    Add SMB User
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <Card>
              <CardBody style={{ padding: 0 }}>
                <Table aria-label="Samba Users Table">
                  <Thead>
                    <Tr>
                      <Th sort={getUserSortParams(0)}>Username</Th>
                      <Th sort={getUserSortParams(1)}>Full name</Th>
                      <Th sort={getUserSortParams(2)}>Status</Th>
                      <Th sort={getUserSortParams(3)}>Security identifier (SID)</Th>
                      <Th screenReaderText="Actions" style={{ textAlign: "right", width: "80px" }} />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sortedUsers.map((u) => (
                      <Tr key={u.username}>
                        <Td data-label="Username">
                          <strong><UserIcon style={{ marginRight: 8, color: "var(--pf-v5-global--primary-color--100)" }} />{u.username}</strong>
                        </Td>
                        <Td data-label="Full name">{u.full_name || "—"}</Td>
                        <Td data-label="Status">
                          {u.is_enabled ? (
                            <Label color="green" icon={<CheckCircleIcon />}>Enabled</Label>
                          ) : (
                            <Label color="red" icon={<BanIcon />}>Disabled</Label>
                          )}
                        </Td>
                        <Td data-label="SID">
                          <code style={{ fontSize: "0.8rem" }}>{u.sid || "—"}</code>
                        </Td>
                        <Td data-label="Actions" style={{ textAlign: "right" }}>
                          <Dropdown
                            popperProps={{
                              position: "right",
                              preventOverflow: true,
                              appendTo: () => document.body,
                            }}
                            isOpen={openDropdown === u.username}
                            onSelect={() => setOpenDropdown(null)}
                            onOpenChange={(isOpen) => setOpenDropdown(isOpen ? u.username : null)}
                            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                              <MenuToggle
                                ref={toggleRef}
                                aria-label="User actions"
                                variant="plain"
                                onClick={() => toggleDropdown(u.username)}
                                isExpanded={openDropdown === u.username}
                              >
                                <EllipsisVIcon />
                              </MenuToggle>
                            )}
                          >
                            <DropdownList>
                              <DropdownItem
                                key="passwd"
                                icon={<KeyIcon />}
                                onClick={() => handleOpenPasswd(u.username)}
                              >
                                Set password
                              </DropdownItem>
                              <DropdownItem
                                key="toggle"
                                icon={u.is_enabled ? <BanIcon /> : <CheckCircleIcon />}
                                onClick={() => onSetState(u.username, !u.is_enabled)}
                              >
                                {u.is_enabled ? "Disable user" : "Enable user"}
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                icon={<TrashIcon />}
                                onClick={() => {
                                  setSelectedUser(u.username);
                                  setIsDeleteModalOpen(true);
                                }}
                                style={{ color: "var(--pf-v5-global--danger-color--100)" }}
                              >
                                Delete Samba user
                              </DropdownItem>
                            </DropdownList>
                          </Dropdown>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </div>

        <div style={{ display: activeSubTab === "groups" ? "block" : "none" }}>
          {groups.length === 0 ? (
            <EmptyState>
              <EmptyStateHeader
                titleText="No SMB groups configured"
                icon={<EmptyStateIcon icon={UsersIcon} />}
                headingLevel="h4"
              />
              <EmptyStateBody>
                Create SMB groups to manage group-based permissions across Samba shares.
              </EmptyStateBody>
              <EmptyStateFooter>
                <EmptyStateActions>
                  <Button variant="primary" icon={<UsersIcon />} onClick={handleOpenAddGroup}>
                    Add SMB Group
                  </Button>
                </EmptyStateActions>
              </EmptyStateFooter>
            </EmptyState>
          ) : (
            <Card>
              <CardBody style={{ padding: 0 }}>
                <Table aria-label="Samba Groups Table">
                  <Thead>
                    <Tr>
                      <Th sort={getGroupSortParams(0)}>Group Name</Th>
                      <Th sort={getGroupSortParams(1)}>GID</Th>
                      <Th sort={getGroupSortParams(2)}>Members</Th>
                      <Th screenReaderText="Actions" style={{ textAlign: "right", width: "80px" }} />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sortedGroups.map((grp) => (
                      <Tr key={grp.name}>
                        <Td data-label="Group Name">
                          <strong><UsersIcon style={{ marginRight: 8, color: "var(--pf-v5-global--primary-color--100)" }} />{grp.name}</strong>
                        </Td>
                        <Td data-label="GID">{grp.gid}</Td>
                        <Td data-label="Members">
                          {grp.members.length > 0 ? (
                            <Flex gap={{ default: "gapXs" }}>
                              {grp.members.map((m) => (
                                <Label key={m} color="blue">{m}</Label>
                              ))}
                            </Flex>
                          ) : (
                            <span style={{ color: "var(--pf-v5-global--Color--200)" }}>No members</span>
                          )}
                        </Td>
                        <Td data-label="Actions" style={{ textAlign: "right" }}>
                          <Dropdown
                            popperProps={{
                              position: "right",
                              preventOverflow: true,
                              appendTo: () => document.body,
                            }}
                            isOpen={openDropdown === `group-${grp.name}`}
                            onSelect={() => setOpenDropdown(null)}
                            onOpenChange={(isOpen) => setOpenDropdown(isOpen ? `group-${grp.name}` : null)}
                            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                              <MenuToggle
                                ref={toggleRef}
                                aria-label="Group actions"
                                variant="plain"
                                onClick={() => toggleDropdown(`group-${grp.name}`)}
                                isExpanded={openDropdown === `group-${grp.name}`}
                              >
                                <EllipsisVIcon />
                              </MenuToggle>
                            )}
                          >
                            <DropdownList>
                              <DropdownItem
                                key="edit"
                                icon={<PencilAltIcon />}
                                onClick={() => handleOpenEditGroup(grp)}
                              >
                                Edit group
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                icon={<TrashIcon />}
                                onClick={() => handleOpenDeleteGroup(grp)}
                                style={{ color: "var(--pf-v5-global--danger-color--100)" }}
                              >
                                Delete group
                              </DropdownItem>
                            </DropdownList>
                          </Dropdown>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          )}
        </div>

        <div style={{ display: activeSubTab === "matrix" ? "block" : "none" }}>
          <Card>
            <CardBody style={{ padding: 0 }}>
              <Table aria-label="User Access Matrix Table">
                <Thead>
                  <Tr>
                    <Th>Samba user</Th>
                    {allShareNames.map((sName) => (
                      <Th key={sName}>[{sName === "homes" ? "homes: /home/$USER" : sName}]</Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredMatrix.map((item) => (
                    <Tr key={item.username}>
                      <Td data-label="Samba user">
                        <strong>{item.username}</strong>
                        {!item.is_enabled && (
                          <Label color="red" style={{ marginLeft: 6 }}>Disabled</Label>
                        )}
                      </Td>
                      {allShareNames.map((sName) => {
                        const perm = item.shares.find((s) => s.share_name === sName);
                        if (!perm) return <Td key={sName}>—</Td>;
                        if (perm.access === "read_write") {
                          return <Td key={sName}><Label color="green">Read / Write</Label></Td>;
                        }
                        if (perm.access === "read_only") {
                          return <Td key={sName}><Label color="blue">Read-Only</Label></Td>;
                        }
                        if (perm.access === "guest_only") {
                          return <Td key={sName}><Label color="purple">Guest Only</Label></Td>;
                        }
                        return <Td key={sName}><Label color="grey">Denied</Label></Td>;
                      })}
                    </Tr>
                  ))}
                  {filteredMatrix.length === 0 && (
                    <Tr>
                      <Td colSpan={allShareNames.length + 1} style={{ textAlign: "center", padding: "2rem", color: "var(--pf-v5-global--Color--200)" }}>
                        No user access matrix data available.
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        </div>
      </PageSection>

      {/* Add User Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Add Samba User"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSaveAdd}
            isDisabled={loading || !username.trim() || !password}
            isLoading={loading}
          >
            Add SMB User
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsAddModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="System Unix User" isRequired fieldId="add-username">
            {unixUsers.length > 0 ? (
              <FormSelect
                id="add-username"
                value={username}
                onChange={(_event, val) => setUsername(val)}
              >
                {unixUsers.map((u) => (
                  <FormSelectOption key={u} value={u} label={u} />
                ))}
              </FormSelect>
            ) : (
              <TextInput
                id="add-username"
                value={username}
                onChange={(_event, val) => setUsername(val)}
                placeholder="e.g. test-user"
              />
            )}
          </FormGroup>

          <FormGroup label="Samba Password" isRequired fieldId="add-password">
            <TextInput
              id="add-password"
              type="password"
              value={password}
              onChange={(_event, val) => setPassword(val)}
            />
          </FormGroup>

          <FormGroup label="Confirm Password" isRequired fieldId="add-confirm-password">
            <TextInput
              id="add-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(_event, val) => setConfirmPassword(val)}
            />
          </FormGroup>

          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
              {error}
            </Alert>
          )}
        </Form>
      </Modal>

      {/* Set Password Modal */}
      <Modal
        variant={ModalVariant.small}
        title={`Set Password for ${selectedUser}`}
        isOpen={isPasswdModalOpen}
        onClose={() => setIsPasswdModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSavePasswd}
            isDisabled={loading || !password}
            isLoading={loading}
          >
            Update password
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsPasswdModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="New Password" isRequired fieldId="set-password">
            <TextInput
              id="set-password"
              type="password"
              value={password}
              onChange={(_event, val) => setPassword(val)}
              autoFocus
            />
          </FormGroup>

          <FormGroup label="Confirm New Password" isRequired fieldId="set-confirm-password">
            <TextInput
              id="set-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(_event, val) => setConfirmPassword(val)}
            />
          </FormGroup>

          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
              {error}
            </Alert>
          )}
        </Form>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete Samba User"
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        actions={[
          <Button key="delete" variant="danger" onClick={handleDelete} isLoading={loading}>
            Delete Samba user
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>,
        ]}
      >
        Are you sure you want to remove <strong>{selectedUser}</strong> from the Samba passdb?
        The system Unix account will remain untouched.
      </Modal>

      {/* Add SMB Group Modal */}
      <Modal
        variant={ModalVariant.medium}
        title="Create SMB Group"
        isOpen={isAddGroupModalOpen}
        onClose={() => setIsAddGroupModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSaveAddGroup}
            isDisabled={loading || !groupName.trim()}
            isLoading={loading}
          >
            Create Group
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsAddGroupModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="Group Name" isRequired fieldId="add-group-name">
            <TextInput
              id="add-group-name"
              value={groupName}
              onChange={(_event, val) => setGroupName(val)}
              placeholder="e.g. smbusers"
            />
          </FormGroup>

          <FormGroup label="Members" fieldId="add-group-members">
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--pf-v5-global--BorderColor--100)", padding: 8, borderRadius: 4 }}>
              {allAvailableUsers.map((u) => (
                <Checkbox
                  key={u}
                  id={`add-grp-user-${u}`}
                  label={u}
                  isChecked={groupMembers.includes(u)}
                  onChange={(_event, checked) => {
                    if (checked) {
                      setGroupMembers([...groupMembers, u]);
                    } else {
                      setGroupMembers(groupMembers.filter((m) => m !== u));
                    }
                  }}
                />
              ))}
              {allAvailableUsers.length === 0 && <div>No users available</div>}
            </div>
          </FormGroup>

          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
              {error}
            </Alert>
          )}
        </Form>
      </Modal>

      {/* Edit SMB Group Modal */}
      <Modal
        variant={ModalVariant.medium}
        title={`Edit SMB Group: ${selectedGroup?.name}`}
        isOpen={isEditGroupModalOpen}
        onClose={() => setIsEditGroupModalOpen(false)}
        actions={[
          <Button
            key="save"
            variant="primary"
            onClick={handleSaveEditGroup}
            isDisabled={loading || !groupName.trim()}
            isLoading={loading}
          >
            Save Changes
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsEditGroupModalOpen(false)} isDisabled={loading}>
            Cancel
          </Button>,
        ]}
      >
        <Form>
          <FormGroup label="Group Name" isRequired fieldId="edit-group-name">
            <TextInput
              id="edit-group-name"
              value={groupName}
              onChange={(_event, val) => setGroupName(val)}
            />
          </FormGroup>

          <FormGroup label="Members" fieldId="edit-group-members">
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--pf-v5-global--BorderColor--100)", padding: 8, borderRadius: 4 }}>
              {allAvailableUsers.map((u) => (
                <Checkbox
                  key={u}
                  id={`edit-grp-user-${u}`}
                  label={u}
                  isChecked={groupMembers.includes(u)}
                  onChange={(_event, checked) => {
                    if (checked) {
                      setGroupMembers([...groupMembers, u]);
                    } else {
                      setGroupMembers(groupMembers.filter((m) => m !== u));
                    }
                  }}
                />
              ))}
            </div>
          </FormGroup>

          {error && (
            <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
              {error}
            </Alert>
          )}
        </Form>
      </Modal>

      {/* Delete SMB Group Modal */}
      <Modal
        variant={ModalVariant.small}
        title="Delete SMB Group"
        isOpen={isDeleteGroupModalOpen}
        onClose={() => setIsDeleteGroupModalOpen(false)}
        actions={[
          <Button key="delete" variant="danger" onClick={handleDeleteGroupAction} isLoading={loading}>
            Delete Group
          </Button>,
          <Button key="cancel" variant="secondary" onClick={() => setIsDeleteGroupModalOpen(false)}>
            Cancel
          </Button>,
        ]}
      >
        Are you sure you want to delete SMB group <strong>{selectedGroup?.name}</strong>?
        {error && (
          <Alert variant="danger" title="Error" style={{ marginTop: "1rem" }}>
            {error}
          </Alert>
        )}
      </Modal>
    </>
  );
};

