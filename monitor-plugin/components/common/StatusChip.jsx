import React, { useState } from 'react';
import { STATUS_META } from '../../lib/task-meta.js';
import { chip } from '../../lib/styles.js';

export function StatusChip({ taskId, status, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status];

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ ...chip(meta.color), cursor: 'pointer', background: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}>
        {meta.label} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
            display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140,
            background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: 4,
          }}>
            {Object.entries(STATUS_META).map(([nextStatus, nextMeta]) => (
              <button
                key={nextStatus}
                onClick={() => {
                  setOpen(false);
                  if (nextStatus !== status) onStatusChange(taskId, nextStatus);
                }}
                style={{ ...chip(nextMeta.color), cursor: 'pointer', textAlign: 'left' }}
              >
                {nextMeta.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
