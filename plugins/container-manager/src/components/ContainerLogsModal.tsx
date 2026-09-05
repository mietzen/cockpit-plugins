import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ModalVariant,
  Button,
  Select,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Checkbox,
  Flex,
  FlexItem,
  Alert,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { XtermLogViewer } from '@cockpit-plugins/common';
import { ContainerItem, EngineType } from '../types';
import { containerApi } from '../api/containerClient';

export interface ContainerLogsModalProps {
  isOpen: boolean;
  container: ContainerItem | null;
  activeEngine: EngineType;
  isDark?: boolean;
  onClose: () => void;
}

const TAIL_OPTIONS = [50, 100, 200, 500, 1000];

export const ContainerLogsModal: React.FC<ContainerLogsModalProps> = ({
  isOpen,
  container,
  activeEngine,
  isDark = true,
  onClose,
}) => {
  const processRef = useRef<any>(null);
  const [logs, setLogs] = useState<string>('');
  const [tailLines, setTailLines] = useState<number>(200);
  const [tailDropdownOpen, setTailDropdownOpen] = useState(false);
  const [timestamps, setTimestamps] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLogStream = () => {
    if (!container) return;

    if (processRef.current) {
      try {
        processRef.current.close('terminate');
      } catch {
        // Ignore
      }
      processRef.current = null;
    }

    setLogs('');
    setError(null);
    setIsStreaming(true);

    const proc = containerApi.spawnLogs(container.id, tailLines, timestamps, activeEngine);
    if (!proc) {
      // Mock logs in standalone mode
      const mockLogLines = [
        '\x1b[36m2026-09-05T06:00:00.123Z\x1b[0m \x1b[1;32m[INFO]\x1b[0m Starting service server...',
        '\x1b[36m2026-09-05T06:00:00.456Z\x1b[0m \x1b[1;32m[INFO]\x1b[0m Loaded configuration profile \x1b[33mproduction\x1b[0m',
        '\x1b[36m2026-09-05T06:00:01.002Z\x1b[0m \x1b[1;34m[DEBUG]\x1b[0m Connecting to database at 127.0.0.1:5432...',
        '\x1b[36m2026-09-05T06:00:01.520Z\x1b[0m \x1b[1;32m[INFO]\x1b[0m Database connection established.',
        '\x1b[36m2026-09-05T06:00:02.100Z\x1b[0m \x1b[1;35m[HTTP]\x1b[0m Server listening on port \x1b[1;37m80\x1b[0m',
        '\x1b[36m2026-09-05T06:15:22.341Z\x1b[0m \x1b[1;33m[WARN]\x1b[0m High request rate detected on /api/v1/metrics',
      ].join('\r\n') + '\r\n';
      setLogs(mockLogLines);
      return;
    }

    processRef.current = proc;

    proc.stream((chunk: string) => {
      setLogs((prev) => prev + chunk);
    });

    proc.then(() => {
      setIsStreaming(false);
    }).catch((err: any) => {
      setIsStreaming(false);
      setError(err?.message || String(err));
    });
  };

  useEffect(() => {
    if (isOpen && container) {
      startLogStream();
    } else {
      if (processRef.current) {
        try {
          processRef.current.close('terminate');
        } catch {
          // Ignore
        }
        processRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [isOpen, container, tailLines, timestamps]);

  if (!isOpen || !container) {
    return null;
  }

  return (
    <Modal
      variant={ModalVariant.large}
      title={`Logs: ${container.name}`}
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
          Close Logs
        </Button>,
      ]}
    >
      <div style={{ marginBottom: '1rem' }}>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsMd' }} alignItems={{ default: 'alignItemsCenter' }}>
              <Flex spaceItems={{ default: 'spaceItemsXs' }} alignItems={{ default: 'alignItemsCenter' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Tail lines:</span>
                <Select
                  isOpen={tailDropdownOpen}
                  selected={String(tailLines)}
                  onSelect={(_event, val) => {
                    setTailLines(Number(val));
                    setTailDropdownOpen(false);
                  }}
                  onOpenChange={(open) => setTailDropdownOpen(open)}
                  toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle ref={toggleRef} onClick={() => setTailDropdownOpen(!tailDropdownOpen)}>
                      {tailLines} lines
                    </MenuToggle>
                  )}
                >
                  {TAIL_OPTIONS.map((opt) => (
                    <SelectOption key={opt} value={String(opt)}>
                      {opt} lines
                    </SelectOption>
                  ))}
                </Select>
              </Flex>

              <Checkbox
                id="timestamps-toggle"
                label="Show Timestamps (-t)"
                isChecked={timestamps}
                onChange={(_event, checked) => setTimestamps(checked)}
              />

              <Button
                variant="plain"
                icon={<SyncAltIcon />}
                onClick={startLogStream}
                isLoading={isStreaming}
                aria-label="Reload logs"
              />
            </Flex>
          </FlexItem>

          <FlexItem>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                color: isStreaming ? '#3fb950' : '#8b949e',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isStreaming ? '#3fb950' : '#8b949e',
                }}
              />
              {isStreaming ? 'Streaming' : 'Ended'}
            </span>
          </FlexItem>
        </Flex>
      </div>

      {error && (
        <Alert variant="danger" isInline title="Log Stream Error" style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}

      <div style={{ height: '450px', width: '100%' }}>
        <XtermLogViewer
          logs={logs}
          isDark={isDark}
          onClear={() => setLogs('')}
        />
      </div>
    </Modal>
  );
};
