import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface XtermTerminalHandle {
  write(data: string | Uint8Array): void;
  writeln(data: string): void;
  clear(): void;
  focus(): void;
  fit(): void;
}

export interface XtermTerminalProps {
  onData?: (data: string) => void;
  onResize?: (size: { cols: number; rows: number }) => void;
  isDark?: boolean;
  fontSize?: number;
  fontFamily?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const XtermTerminal = forwardRef<XtermTerminalHandle, XtermTerminalProps>(
  (
    {
      onData,
      onResize,
      isDark = true,
      fontSize = 13,
      fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      className,
      style,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    const darkTheme = {
      background: '#151515',
      foreground: '#e0e0e0',
      cursor: '#388bfd',
      selectionBackground: 'rgba(56, 139, 253, 0.3)',
      black: '#000000',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#bfbfbf',
      brightBlack: '#4d4d4d',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    };

    const lightTheme = {
      background: '#f8f9fa',
      foreground: '#1f2328',
      cursor: '#0969da',
      selectionBackground: 'rgba(9, 105, 218, 0.2)',
      black: '#000000',
      red: '#cf222e',
      green: '#1a7f37',
      yellow: '#9a6700',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#a40e26',
      brightGreen: '#116329',
      brightYellow: '#4d2d00',
      brightBlue: '#0550ae',
      brightMagenta: '#5a32a3',
      brightCyan: '#114a4e',
      brightWhite: '#24292f',
    };

    useImperativeHandle(
      ref,
      () => ({
        write(data) {
          termRef.current?.write(data);
        },
        writeln(data) {
          termRef.current?.writeln(data);
        },
        clear() {
          termRef.current?.clear();
        },
        focus() {
          termRef.current?.focus();
        },
        fit() {
          try {
            fitAddonRef.current?.fit();
          } catch {
            // Ignore resize error if container is hidden
          }
        },
      }),
      []
    );

    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontSize,
        fontFamily,
        theme: isDark ? darkTheme : lightTheme,
        convertEol: true,
        allowTransparency: false,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      const dataDisposable = term.onData((data) => {
        onData?.(data);
      });

      const resizeDisposable = term.onResize((size) => {
        onResize?.(size);
      });

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore resize errors when container unmounted or display: none
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        dataDisposable.dispose();
        resizeDisposable.dispose();
        resizeObserver.disconnect();
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
      };
    }, []);

    // Theme update
    useEffect(() => {
      if (termRef.current) {
        termRef.current.options.theme = isDark ? darkTheme : lightTheme;
      }
    }, [isDark]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '300px',
          overflow: 'hidden',
          borderRadius: '6px',
          backgroundColor: isDark ? '#151515' : '#f8f9fa',
          padding: '4px',
          ...style,
        }}
      />
    );
  }
);

XtermTerminal.displayName = 'XtermTerminal';
