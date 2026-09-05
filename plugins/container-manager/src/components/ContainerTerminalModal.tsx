import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  TextInput,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Flex,
  FlexItem,
  Alert,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { XtermTerminal, XtermTerminalHandle } from '@cockpit-plugins/common';
import { ContainerItem, EngineType } from '../types';
import { containerApi } from '../api/containerClient';

export interface ContainerTerminalModalProps {
  isOpen: boolean;
  container: ContainerItem | null;
  activeEngine: EngineType;
  isDark?: boolean;
  onClose: () => void;
}

const SHELL_PRESETS = ['/bin/sh', '/bin/bash', '/bin/ash', '/bin/zsh', 'custom'];

export const ContainerTerminalModal: React.FC<ContainerTerminalModalProps> = ({
  isOpen,
  container,
  activeEngine,
  isDark = true,
  onClose,
}) => {
  const terminalRef = useRef<XtermTerminalHandle>(null);
  const processRef = useRef<any>(null);

  const [selectedShell, setSelectedShell] = useState('/bin/sh');
  const [customCommand, setCustomCommand] = useState('');
  const [shellDropdownOpen, setShellDropdownOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCommand = selectedShell === 'custom' ? (customCommand || '/bin/sh') : selectedShell;

  const startSession = () => {
    if (!container) return;

    // Terminate any previous session
    if (processRef.current) {
      try {
        processRef.current.close('terminate');
      } catch {
        // Ignore
      }
      processRef.current = null;
    }

    terminalRef.current?.clear();
    setError(null);
    setIsConnected(true);

    terminalRef.current?.writeln(`\x1b[1;34mConnecting to ${container.name} via ${effectiveCommand}...\x1b[0m\r\n`);

    const proc = containerApi.spawnTerminal(container.id, effectiveCommand, activeEngine);
    if (!proc) {
      // Mock session in standalone mode
      terminalRef.current?.writeln('\x1b[33m[Mock Terminal Session - Cockpit not detected]\x1b[0m\r\n');
      terminalRef.current?.write(`/ # `);
      return;
    }

    processRef.current = proc;

    proc.stream((data: string) => {
      terminalRef.current?.write(data);
    });

    proc.then(() => {
      setIsConnected(false);
      terminalRef.current?.writeln('\r\n\x1b[1;31m[Process exited]\x1b[0m');
    }).catch((err: any) => {
      setIsConnected(false);
      setError(err?.message || String(err));
      terminalRef.current?.writeln(`\r\n\x1b[1;31m[Error: ${err?.message || err}]\x1b[0m`);
    });
  };

  useEffect(() => {
    if (isOpen && container) {
      // Delay slightly for modal animation and DOM layout
      const timer = setTimeout(() => {
        startSession();
      }, 150);
      return () => clearTimeout(timer);
    } else {
      if (processRef.current) {
        try {
          processRef.current.close('terminate');
        } catch {
          // Ignore
        }
        processRef.current = null;
      }
      setIsConnected(false);
    }
  }, [isOpen, container]);

  const handleData = (data: string) => {
    if (processRef.current) {
      try {
        processRef.current.input(data);
      } catch (e) {
        console.warn('Failed to send input to terminal process:', e);
      }
    } else {
      // Echo back in mock mode
      if (data === '\r') {
        terminalRef.current?.writeln('');
        terminalRef.current?.write('/ # ');
      } else if (data === '\u007F') {
        terminalRef.current?.write('\b \b');
      } else {
        terminalRef.current?.write(data);
      }
    }
  };

  const handleResize = (size: { cols: number; rows: number }) => {
    if (processRef.current && typeof processRef.current.control === 'function') {
      try {
        processRef.current.control({ window: { rows: size.rows, cols: size.cols } });
      } catch {
        // Ignore resize control failure
      }
    }
  };

  if (!isOpen || !container) {
    return null;
  }

  return (
    <Modal
      variant={ModalVariant.large}
      title={`Terminal: ${container.name}`}
      isOpen={isOpen}
      onClose={() => {
        if (processRef.current) {
          try {
            processRef.current.close('terminate');
          } catch {
            // Ignore
          }
          processRef.current = null;
        }
        onClose();
      }}
      appendTo={() => document.body}
      actions={[
        <Button key="close" variant="secondary" onClick={onClose}>
          Close Terminal
        </Button>,
      ]}
    >
      <div style={{ marginBottom: '1rem' }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Command:</span>
              <Select
                isOpen={shellDropdownOpen}
                selected={selectedShell}
                onSelect={(_event, val) => {
                  setSelectedShell(String(val));
                  setShellDropdownOpen(false);
                }}
                onOpenChange={(open) => setShellDropdownOpen(open)}
                toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                  <MenuToggle ref={toggleRef} onClick={() => setShellDropdownOpen(!shellDropdownOpen)}>
                    {selectedShell}
                  </MenuToggle>
                )}
              >
                {SHELL_PRESETS.map((p) => (
                  <SelectOption key={p} value={p}>
                    {p}
                  </SelectOption>
                ))}
              </Select>

              {selectedShell === 'custom' && (
                <TextInput
                  placeholder="/bin/bash -l"
                  value={customCommand}
                  onChange={(_e, val) => setCustomCommand(val)}
                  style={{ width: '200px' }}
                />
              )}

              <Button
                variant="secondary"
                icon={<SyncAltIcon />}
                onClick={startSession}
                size="sm"
              >
                {isConnected ? 'Restart Session' : 'Connect'}
              </Button>
            </Flex>
          </FlexItem>

          <FlexItem>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                color: isConnected ? '#3fb950' : '#8b949e',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isConnected ? '#3fb950' : '#8b949e',
                }}
              />
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </FlexItem>
        </Flex>
      </div>

      {error && (
        <Alert variant="danger" isInline title="Session Error" style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}

      <div style={{ height: '450px', width: '100%', position: 'relative' }}>
        <XtermTerminal
          ref={terminalRef}
          isDark={isDark}
          onData={handleData}
          onResize={handleResize}
          style={{ height: '100%' }}
        />
      </div>
    </Modal>
  );
};
