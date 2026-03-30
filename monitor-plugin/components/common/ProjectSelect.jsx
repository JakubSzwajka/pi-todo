import React from 'react';

export function ProjectSelect({ value, projects, inherited, disabled, onChange }) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value || null)}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: disabled ? 'var(--fg3)' : 'var(--fg2)',
        background: disabled ? 'var(--surface)' : 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '5px 8px',
        minWidth: 180,
      }}
    >
      <option value="">{inherited ? 'inherits from parent' : 'no project'}</option>
      {projects.map(project => (
        <option key={project.id} value={project.id}>{project.name} ({project.id})</option>
      ))}
    </select>
  );
}
