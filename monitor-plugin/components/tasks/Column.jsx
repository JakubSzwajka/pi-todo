import React from 'react';
import { STATUS_META } from '../../lib/task-meta.js';
import { chip } from '../../lib/styles.js';
import { TaskCard } from './TaskCard.jsx';

export function Column({ status, tasks, allTasks, onSelect, onStatusChange, selectedId, draggingId, onDragStart, onDragEnd, isDragOver, onDragOver, onDragLeave, onDrop }) {
  const meta = STATUS_META[status];

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
        outline: isDragOver ? `2px dashed color-mix(in srgb, ${meta.color} 60%, transparent)` : '2px dashed transparent',
        borderRadius: 'var(--radius)', padding: 4, transition: 'outline-color 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `2px solid color-mix(in srgb, ${meta.color} ${isDragOver ? 80 : 35}%, transparent)` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
        <span style={{ ...chip('var(--fg3)'), background: 'var(--surface)' }}>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: isDragOver ? meta.color : 'var(--fg3)', minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isDragOver ? '⊕ drop here' : '—'}
        </div>
      ) : (
        <>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              onSelect={onSelect}
              onStatusChange={onStatusChange}
              selectedId={selectedId}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
          {isDragOver && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: meta.color, textAlign: 'center',
              padding: '8px 0', borderRadius: 'var(--radius)',
              border: `1px dashed color-mix(in srgb, ${meta.color} 50%, transparent)`,
              background: `color-mix(in srgb, ${meta.color} 6%, transparent)`,
            }}>
              ⊕ drop here
            </div>
          )}
        </>
      )}
    </div>
  );
}
