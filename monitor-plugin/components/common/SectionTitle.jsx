import React from 'react';

export function SectionTitle({ children }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</div>;
}
