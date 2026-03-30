import React, { useCallback, useState } from 'react';

export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        cursor: 'pointer',
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: copied ? 'var(--idle)' : 'var(--fg3)',
        padding: '2px 8px',
      }}
    >
      {copied ? '✓ copied' : '⎘ copy ref'}
    </button>
  );
}
