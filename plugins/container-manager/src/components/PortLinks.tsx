import React from 'react';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';

export interface PortLinksProps {
  ports: string;
  style?: React.CSSProperties;
}

export const PortLinks: React.FC<PortLinksProps> = ({ ports, style }) => {
  if (!ports || !ports.trim()) {
    return <span style={{ color: 'var(--pf-v5-global--Color--200, #8b949e)', fontSize: '0.85rem' }}>—</span>;
  }

  // Split multiple port mappings
  const rawParts = ports.split(',').map((p) => p.trim()).filter(Boolean);

  const parsedParts = rawParts.map((part, idx) => {
    let hostIp = '';
    let hostPort = '';

    if (part.includes('->')) {
      const [hostPart] = part.split('->');
      const colonIdx = hostPart.lastIndexOf(':');
      if (colonIdx !== -1) {
        hostIp = hostPart.slice(0, colonIdx).replace(/^\[|\]$/g, '').trim();
        hostPort = hostPart.slice(colonIdx + 1).trim();
      }
    } else if (part.includes(':')) {
      const colonIdx = part.lastIndexOf(':');
      hostIp = part.slice(0, colonIdx).replace(/^\[|\]$/g, '').trim();
      hostPort = part.slice(colonIdx + 1).split('/')[0].trim();
    }

    if (hostPort && /^\d+$/.test(hostPort)) {
      const currentHostname =
        typeof window !== 'undefined' && window.location?.hostname
          ? window.location.hostname
          : 'localhost';

      const isWildcardOrLocal =
        !hostIp ||
        hostIp === '0.0.0.0' ||
        hostIp === '::' ||
        hostIp === ':::' ||
        hostIp === '127.0.0.1' ||
        hostIp === 'localhost';

      const targetIpOrDomain = isWildcardOrLocal ? currentHostname : hostIp;
      const url = `http://${targetIpOrDomain}:${hostPort}`;

      return (
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--pf-v5-global--primary-color--100, #2b9af3)',
            textDecoration: 'none',
            fontFamily: 'var(--pf-v5-global--FontFamily--monospace, monospace)',
            fontSize: '0.82rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
          title={`Open ${url}`}
        >
          <span>{part}</span>
          <ExternalLinkAltIcon style={{ fontSize: '0.7rem', opacity: 0.85 }} />
        </a>
      );
    }

    return (
      <span
        key={idx}
        style={{
          fontFamily: 'var(--pf-v5-global--FontFamily--monospace, monospace)',
          fontSize: '0.82rem',
          color: 'var(--pf-v5-global--Color--100, #c9d1d9)',
        }}
      >
        {part}
      </span>
    );
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', ...style }}>
      {parsedParts}
    </div>
  );
};
