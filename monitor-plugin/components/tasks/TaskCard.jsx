import React from 'react';
import { getUnresolvedDependencies } from '../../lib/task-utils.js';
import { chip } from '../../lib/styles.js';
import { CopyButton } from '../common/CopyButton.jsx';
import { StatusChip } from '../common/StatusChip.jsx';

export function TaskCard({ task, allTasks, onSelect, onStatusChange, selectedId, draggingId, onDragStart, onDragEnd }) {
  const subtasks = allTasks.filter(candidate => candidate.parentId === task.id);
  const unresolvedTaskDeps = getUnresolvedDependencies(task, allTasks);
  const isDragging = draggingId === task.id;

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(task.id)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', cursor: 'grab',
        borderRadius: 'var(--radius)', border: `1px solid ${selectedId === task.id ? 'var(--accent)' : 'var(--border)'}`,
        background: 'var(--surface)', opacity: isDragging ? 0.4 : 1, transition: 'opacity 120ms',
      }}
    >
      <div style={{ fontSize: 13, color: selectedId === task.id ? 'var(--accent)' : 'var(--fg)', fontWeight: 500 }}>{task.title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {task.project && <span style={chip('var(--accent)')}>{task.project.name}</span>}
        {(task.tags ?? []).map(tag => <span key={tag} style={chip('var(--busy)')}>#{tag}</span>)}
        {unresolvedTaskDeps.length > 0 && <span style={chip('var(--waiting)')}>blocked by {unresolvedTaskDeps.length}</span>}
        {subtasks.length > 0 && <span style={chip('var(--fg3)')}>{subtasks.filter(child => child.status === 'done').length}/{subtasks.length} subtasks</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusChip taskId={task.id} status={task.status} onStatusChange={onStatusChange} />
        <div style={{ flex: 1 }} />
        <CopyButton text={`task #${task.id}`} />
      </div>
    </div>
  );
}
