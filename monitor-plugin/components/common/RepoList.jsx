import React from 'react';

export function RepoList({ project }) {
  if (!project?.repos?.length) return <div style={{ fontSize: 12, color: 'var(--fg3)' }}>No repos attached.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {project.repos.map(repo => (
        <div key={repo.id} style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '2px 8px',
          padding: '4px 0',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 65%, transparent)',
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--fg2)', fontWeight: 500 }}>{repo.label}</span>
            {repo.primary && <span style={{ fontSize: 10, color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>primary</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg3)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
            {repo.path ?? repo.url}
          </div>
        </div>
      ))}
    </div>
  );
}
