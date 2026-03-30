import React, { useCallback, useState } from 'react';
import { buttonStyle, chip, inputStyle } from '../../lib/styles.js';

export function TagEditor({ tags, onAddTag, onRemoveTag }) {
  const [value, setValue] = useState('');
  const add = useCallback(() => {
    const tag = value.trim();
    if (!tag) return;
    onAddTag(tag);
    setValue('');
  }, [onAddTag, value]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map(tag => (
          <span key={tag} style={{ ...chip('var(--accent)'), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            #{tag}
            <button onClick={() => onRemoveTag(tag)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--fg3)' }}>No tags yet.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="add tag"
          style={{ ...inputStyle, minWidth: 140, flex: 1 }}
        />
        <button onClick={add} style={buttonStyle}>add tag</button>
      </div>
    </div>
  );
}
