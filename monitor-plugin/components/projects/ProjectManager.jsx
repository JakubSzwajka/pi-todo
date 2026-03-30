import React, { useCallback, useState } from 'react';
import { deleteProject, updateProject, createProject } from '../../lib/api.js';
import { buttonStyle, chip, inputStyle } from '../../lib/styles.js';
import { RepoList } from '../common/RepoList.jsx';

export function ProjectManager({ projects, tasks, refresh }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ id: '', name: '', description: '', reposText: '' });

  const load = useCallback((project) => {
    setEditingId(project?.id ?? null);
    setDraft({
      id: project?.id ?? '',
      name: project?.name ?? '',
      description: project?.description ?? '',
      reposText: (project?.repos ?? []).map(repo => `${repo.kind}|${repo.label}|${repo.path ?? repo.url ?? ''}|${repo.primary ? 'primary' : ''}`).join(', '),
    });
  }, []);

  const parseRepos = useCallback(() => {
    return draft.reposText
      .split(',')
      .map(chunk => chunk.trim())
      .filter(Boolean)
      .map((entry, index) => {
        const [kind = 'git', label = `repo-${index + 1}`, target = '', primary = ''] = entry.split('|').map(part => part.trim());
        return {
          id: `${label}-${index + 1}`,
          kind,
          label,
          path: kind === 'local' ? target : undefined,
          url: kind === 'local' ? undefined : target,
          primary: primary === 'primary',
        };
      });
  }, [draft.reposText]);

  const save = useCallback(async () => {
    const payload = {
      id: draft.id || draft.name,
      name: draft.name,
      description: draft.description || undefined,
      repos: parseRepos(),
    };
    const result = editingId
      ? await updateProject(editingId, payload)
      : await createProject(payload);
    if (!result.ok) return;
    load(null);
    refresh();
  }, [draft, editingId, load, parseRepos, refresh]);

  const remove = useCallback(async (projectId) => {
    const result = await deleteProject(projectId);
    if (!result.ok) return;
    refresh();
  }, [refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)' }}>projects</div>
        <div style={{ flex: 1 }} />
        <button onClick={() => load(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>+ new project</button>
      </div>

      {(editingId !== null || draft.name || draft.id || draft.description || draft.reposText) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
          <input value={draft.id} onChange={e => setDraft(prev => ({ ...prev, id: e.target.value }))} placeholder="project id" style={inputStyle} />
          <input value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="project name" style={inputStyle} />
          <textarea value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} placeholder="description" style={{ ...inputStyle, minHeight: 60 }} />
          <textarea value={draft.reposText} onChange={e => setDraft(prev => ({ ...prev, reposText: e.target.value }))} placeholder="repos: local|workspace|/path|primary, github|origin|https://..." style={{ ...inputStyle, minHeight: 64 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} style={buttonStyle}>save</button>
            <button onClick={() => load(null)} style={buttonStyle}>cancel</button>
          </div>
        </div>
      )}

      {projects.map(project => {
        const parentTasks = tasks.filter(task => !task.parentId && task.effectiveProjectId === project.id).length;
        return (
          <div key={project.id} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>{project.name}</span>
              <span style={chip('var(--accent)')}>{project.id}</span>
              <span style={chip('var(--fg3)')}>{parentTasks} parent tasks</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => load(project)} style={buttonStyle}>edit</button>
              <button onClick={() => remove(project.id)} style={buttonStyle}>delete</button>
            </div>
            {project.description && <div style={{ fontSize: 12, color: 'var(--fg2)' }}>{project.description}</div>}
            <RepoList project={project} />
          </div>
        );
      })}
    </div>
  );
}
