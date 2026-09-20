import React, { useState } from 'react';
import { Tooltip } from '@patternfly/react-core';
import { CopyIcon, CheckIcon } from '@patternfly/react-icons';

export interface HashIdProps {
  id: string;
  shortId?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const HashId: React.FC<HashIdProps> = ({
  id,
  shortId,
  style,
  className,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  const rawId = id || '';
  const cleanId = rawId.startsWith('sha256:') ? rawId.slice(7) : rawId;
  const rawShort = shortId || '';
  const cleanShort = rawShort.startsWith('sha256:') ? rawShort.slice(7) : rawShort;
  const displayText = cleanShort || cleanId.slice(0, 12);

  const fallbackCopy = (text: string) => {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(el);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cleanId) {
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cleanId).catch(() => {
        fallbackCopy(cleanId);
      });
    } else {
      fallbackCopy(cleanId);
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <Tooltip content={copied ? 'Copied to clipboard!' : `Click to copy: ${cleanId}`}>
      <button
        type="button"
        onClick={handleCopy}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: 'transparent',
          border: 'none',
          padding: '1px 4px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'var(--pf-v5-global--FontFamily--monospace, monospace)',
          fontSize: '0.82rem',
          color: 'var(--pf-v5-global--Color--200, #8b949e)',
          lineHeight: '1.2',
          textAlign: 'left',
          transition: 'background-color 0.15s ease, color 0.15s ease',
          ...style,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--pf-v5-global--BackgroundColor--200, rgba(255,255,255,0.08))';
          e.currentTarget.style.color = 'var(--pf-v5-global--Color--100, #c9d1d9)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--pf-v5-global--Color--200, #8b949e)';
        }}
        aria-label={`Copy ID ${cleanId}`}
      >
        <span>{displayText}</span>
        {copied ? (
          <CheckIcon style={{ fontSize: '0.75rem', color: '#3fb950' }} />
        ) : (
          <CopyIcon style={{ fontSize: '0.75rem', opacity: 0.6 }} />
        )}
      </button>
    </Tooltip>
  );
};
