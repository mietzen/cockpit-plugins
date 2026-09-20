import React, { useRef, useState, useEffect } from 'react';
import {
  Flex,
  FlexItem,
  Button,
  Checkbox,
  Tooltip,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import { XtermTerminal, XtermTerminalHandle } from './XtermTerminal';

export interface XtermLogViewerProps {
  logs: string;
  isDark?: boolean;
  onClear?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const XtermLogViewer: React.FC<XtermLogViewerProps> = ({
  logs,
  isDark = true,
  onClear,
  className,
  style,
}) => {
  const terminalRef = useRef<XtermTerminalHandle>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastRenderedLogLength = useRef(0);

  useEffect(() => {
    if (!terminalRef.current) return;

    if (logs.length < lastRenderedLogLength.current) {
      // Logs were reset or cleared
      terminalRef.current.clear();
      terminalRef.current.write(logs);
    } else {
      // Append new chunk
      const newChunk = logs.slice(lastRenderedLogLength.current);
      if (newChunk) {
        terminalRef.current.write(newChunk);
      }
    }

    lastRenderedLogLength.current = logs.length;

    if (autoScroll) {
      // Scroll to bottom
      terminalRef.current.fit();
    }
  }, [logs, autoScroll]);

  const handleClear = () => {
    terminalRef.current?.clear();
    lastRenderedLogLength.current = 0;
    onClear?.();
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '350px',
        border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        borderRadius: '6px',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: isDark ? '#161b22' : '#f6f8fa',
          borderBottom: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`,
        }}
      >
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
              <Checkbox
                id="autoscroll-toggle"
                label="Auto-scroll"
                isChecked={autoScroll}
                onChange={(_event, checked) => setAutoScroll(checked)}
              />
            </Flex>
          </FlexItem>
          <FlexItem>
            <Flex spaceItems={{ default: 'spaceItemsSm' }}>
              {onClear && (
                <Tooltip content="Clear log output">
                  <Button variant="plain" onClick={handleClear} aria-label="Clear logs">
                    <TrashIcon />
                  </Button>
                </Tooltip>
              )}
            </Flex>
          </FlexItem>
        </Flex>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <XtermTerminal
          ref={terminalRef}
          isDark={isDark}
          style={{ height: '100%', minHeight: '100%', borderRadius: 0 }}
        />
      </div>
    </div>
  );
};
