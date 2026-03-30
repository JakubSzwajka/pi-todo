export function chip(color, extra) {
  return {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: 1,
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    padding: '3px 7px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    ...extra,
  };
}

export const formLabelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--fg3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export const inputStyle = {
  width: '100%',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--fg)',
  background: 'var(--bg2)',
  border: '1px solid var(--border2)',
  borderRadius: 6,
  padding: '6px 8px',
  boxSizing: 'border-box',
};

export const buttonStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg2)',
  padding: '4px 10px',
};

export const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid var(--border)',
};

export const rowStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
};

export const linkButtonStyle = {
  fontSize: 12,
  color: 'var(--accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};
