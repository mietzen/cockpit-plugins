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
  Alert,
} from "@patternfly/react-core";
import { Table, Thead, Tbody, Tr, Th, Td } from "@patternfly/react-table";
import {
  UserPlusIcon,
  UsersIcon,
  CheckCircleIcon,
  BanIcon,
  EllipsisVIcon,
  KeyIcon,
  TrashIcon,
  UserIcon,
} from "@patternfly/react-icons";
import { SmbUser, UserAccessMatrixItem } from "../types";

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
  onDeleteUser,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"users" | "matrix">("users");
  const [searchValue, setSearchValue] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswdModalOpen, setIsPasswdModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDropdown = (user: string) => {
    setOpenDropdown(openDropdown === user ? null : user);
  };

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
    if (!selectedUser) return;
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

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchValue.toLowerCase()) ||
    (u.full_name && u.full_name.toLowerCase().includes(searchValue.toLowerCase()))
  );

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
                  placeholder="Search users..."
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value)}
                  onClear={() => setSearchValue("")}
                  style={{ width: 260 }}
                />
              </FlexItem>
              <FlexItem>
                <Button variant="primary" icon={<UserPlusIcon />} onClick={handleOpenAdd}>
                  Add user
                </Button>
              </FlexItem>
            </Flex>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection style={{ paddingTop: "1rem" }}>
        <Tabs
          activeKey={activeSubTab}
          onSelect={(_event, tabKey) => setActiveSubTab(tabKey as "users" | "matrix")}
          style={{ marginBottom: "1.5rem" }}
        >
          <Tab eventKey="users" title={<TabTitleText>Samba Users ({users.length})</TabTitleText>} />
          <Tab eventKey="matrix" title={<TabTitleText>User Access Matrix</TabTitleText>} />
        </Tabs>

        {activeSubTab === "users" ? (
          users.length === 0 ? (
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
                    Add user
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
                      <Th>Username</Th>
                      <Th>Full name</Th>
                      <Th>Status</Th>
                      <Th>Security identifier (SID)</Th>
                      <Th style={{ textAlign: "right", width: "80px" }}></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filteredUsers.map((u) => (
                      <Tr key={u.username}>
                        <Td data-label="Username">
                          <strong><UserIcon style={{ marginRight: 8, color: "var(--zfs-tab-active-color)" }} />{u.username}</strong>
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
                            popperProps={{ appendTo: () => document.body }}
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
          )
        ) : (
          <Card>
            <CardBody style={{ padding: 0 }}>
              <Table aria-label="User Access Matrix Table">
                <Thead>
                  <Tr>
                    <Th>Samba user</Th>
                    {allShareNames.map((sName) => (
                      <Th key={sName}>[{sName}]</Th>
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
                      <Td colSpan={allShareNames.length + 1} style={{ textAlign: "center", padding: "2rem", color: "var(--zfs-text-secondary)" }}>
                        No user access matrix data available.
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </CardBody>
          </Card>
        )}
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
            Add user
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
    </>
  );
};
