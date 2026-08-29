import React, { useState, useEffect } from 'react';
import {
  Button,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalVariant,
  TextInput,
  Divider
} from '@patternfly/react-core';
import { SmbGlobal } from '../types';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  globalConfig: SmbGlobal;
  ansibleBegin: string;
  ansibleEnd: string;
  onClose: () => void;
  onSaveGlobal: (data: SmbGlobal) => Promise<void>;
  onUpdateAnsibleMarkers: (begin: string, end: string) => void;
}

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  globalConfig,
  ansibleBegin,
  ansibleEnd,
  onClose,
  onSaveGlobal,
  onUpdateAnsibleMarkers
}) => {
  const [workgroup, setWorkgroup] = useState('WORKGROUP');
  const [serverString, setServerString] = useState('');
  const [passdbBackend, setPassdbBackend] = useState('tdbsam');
  const [security, setSecurity] = useState('user');
  const [minProto, setMinProto] = useState('SMB2_02');
  const [maxProto, setMaxProto] = useState('SMB3');

  const [beginMarker, setBeginMarker] = useState(ansibleBegin);
  const [endMarker, setEndMarker] = useState(ansibleEnd);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setWorkgroup(globalConfig.workgroup || 'WORKGROUP');
      setServerString(globalConfig['server string'] || '');
      setPassdbBackend(globalConfig['passdb backend'] || 'tdbsam');
      setSecurity(globalConfig.security || 'user');
      setMinProto(globalConfig['server min protocol'] || 'SMB2_02');
      setMaxProto(globalConfig['server max protocol'] || 'SMB3');
      setBeginMarker(ansibleBegin);
      setEndMarker(ansibleEnd);
      setError(null);
    }
  }, [isOpen, globalConfig, ansibleBegin, ansibleEnd]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSaveGlobal({
        workgroup: workgroup.trim(),
        'server string': serverString.trim(),
        'passdb backend': passdbBackend.trim(),
        security: security.trim(),
        'server min protocol': minProto,
        'server max protocol': maxProto
      });
      onUpdateAnsibleMarkers(beginMarker.trim(), endMarker.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save global configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.medium}
      title="Samba Global Settings & Automation Configuration"
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="save" variant="primary" onClick={handleSave} isLoading={loading}>
          Save Settings
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>
      ]}
    >
      <Form>
        {error && <div style={{ color: 'var(--pf-v5-global--danger-color--100)', marginBottom: 10 }}>{error}</div>}

        <FormGroup label="Workgroup" isRequired fieldId="smb-workgroup">
          <TextInput
            id="smb-workgroup"
            value={workgroup}
            onChange={(_e, val) => setWorkgroup(val)}
            placeholder="WORKGROUP"
          />
        </FormGroup>

        <FormGroup label="Server Description / String" fieldId="smb-server-string">
          <TextInput
            id="smb-server-string"
            value={serverString}
            onChange={(_e, val) => setServerString(val)}
            placeholder="Cockpit File Server"
          />
        </FormGroup>

        <FormGroup label="Passdb Authentication Backend" fieldId="smb-passdb">
          <FormSelect
            id="smb-passdb"
            value={passdbBackend}
            onChange={(_e, val) => setPassdbBackend(val)}
            aria-label="Select Passdb Backend"
          >
            <FormSelectOption value="tdbsam" label="tdbsam (Local Trivial Database SAM - Standard)" />
            <FormSelectOption value="ldapsam" label="ldapsam (LDAP Directory SAM)" />
            <FormSelectOption value="smbpasswd" label="smbpasswd (Legacy Plain Text)" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Security Mode" fieldId="smb-security">
          <FormSelect
            id="smb-security"
            value={security}
            onChange={(_e, val) => setSecurity(val)}
            aria-label="Select Security Mode"
          >
            <FormSelectOption value="user" label="User (Local user authorization - Default)" />
            <FormSelectOption value="ads" label="ADS (Active Directory Domain Member)" />
          </FormSelect>
        </FormGroup>

        <FormGroup label="Minimum Protocol Version" fieldId="smb-min-proto">
          <FormSelect
            id="smb-min-proto"
            value={minProto}
            onChange={(_e, val) => setMinProto(val)}
            aria-label="Select Min Protocol"
          >
            <FormSelectOption value="SMB2_02" label="SMB 2.02 (Modern secure default)" />
            <FormSelectOption value="SMB3" label="SMB 3.0" />
            <FormSelectOption value="NT1" label="NT1 / SMBv1 (Legacy - Insecure)" />
          </FormSelect>
        </FormGroup>

        <Divider style={{ margin: '1.5rem 0' }} />
        <h4 style={{ margin: '0 0 0.5rem 0' }}>🤖 Ansible / External Automation Managed Block Markers</h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--pf-v5-global--Color--200)', marginBottom: '1rem' }}>
          Specify wildcards (e.g. <code>*</code>) for comment markers used by Ansible to delimit managed configuration blocks.
        </p>

        <FormGroup label="Begin Managed Block Marker Pattern" fieldId="ansible-begin">
          <TextInput
            id="ansible-begin"
            value={beginMarker}
            onChange={(_e, val) => setBeginMarker(val)}
            placeholder="# <-- BEGIN ANSIBLE MANAGED * CONFIG -->"
          />
        </FormGroup>

        <FormGroup label="End Managed Block Marker Pattern" fieldId="ansible-end">
          <TextInput
            id="ansible-end"
            value={endMarker}
            onChange={(_e, val) => setEndMarker(val)}
            placeholder="# <-- END ANSIBLE MANAGED * CONFIG -->"
          />
        </FormGroup>
      </Form>
    </Modal>
  );
};
