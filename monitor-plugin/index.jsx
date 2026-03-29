import React, { useCallback, useEffect, useMemo, useState } from 'react';

const COLUMNS = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done'];

const STATUS_META = {
  open:        { label: '○ open', color: 'var(--fg2)' },
  in_progress: { label: '◑ in progress', color: 'var(--busy)' },
  review:      { label: '◉ review', color: 'var(--waiting)' },
  testing:     { label: '⬡ testing', color: 'hsl(280,60%,65%)' },
  waiting:     { label: '◌ waiting', color: 'hsl(25,80%,60%)' },
  done:        { label: '● done', color: 'var(--idle)' },
  cancelled:   { label: '✕ cancelled', color: 'var(--fg3)' },
};

function chip(color, extra) {
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

function fmtDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function getDependencies(task, allTasks) {
  return allTasks.filter(candidate => (task.dependsOnIds ?? []).includes(candidate.id));
}

function getBlockedBy(task, allTasks) {
  return allTasks.filter(candidate => (candidate.dependsOnIds ?? []).includes(task.id));
}

function getUnresolvedDependencies(task, allTasks) {
  return getDependencies(task, allTasks).filter(dep => dep.status !== 'done');
}

function topologicalSubtasks(subtasks) {
  const ids = new Set(subtasks.map(task => task.id));
  const visited = new Set();
  const result = [];
  function visit(task) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const depId of (task.dependsOnIds ?? [])) {
      if (!ids.has(depId)) continue;
      const dep = subtasks.find(candidate => candidate.id === depId);
      if (dep) visit(dep);
    }
    result.push(task);
  }
  for (const task of subtasks) visit(task);
  return result;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [text]);
  return (
    <button onClick={onClick} style={{
      fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
      borderRadius: 4, border: '1px solid var(--border)', background: 'transparent',
      color: copied ? 'var(--idle)' : 'var(--fg3)', padding: '2px 8px',
    }}>
      {copied ? '✓ copied' : '⎘ copy ref'}
    </button>
  );
}

function StatusChip({ taskId, status, onStatusChange }) {
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
                onClick={() => { setOpen(false); if (nextStatus !== status) onStatusChange(taskId, nextStatus); }}
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

function DependencyEditor({ task, allTasks, onDependencyChange }) {
  const [open, setOpen] = useState(false);
  const candidates = allTasks.filter(candidate => candidate.id !== task.id && candidate.parentId === task.parentId);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
        borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg2)', padding: '4px 10px',
      }}>
        dependencies ▾ {(task.dependsOnIds ?? []).length ? `(${task.dependsOnIds.length})` : ''}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
            minWidth: 320, maxWidth: 460, maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
            padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {candidates.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--fg3)' }}>No sibling tasks available.</div>
            ) : candidates.map(candidate => {
              const selected = (task.dependsOnIds ?? []).includes(candidate.id);
              return (
                <label key={candidate.id} style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 6, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                }}>
                  <input type="checkbox" checked={selected} onChange={e => onDependencyChange(task.id, candidate.id, e.target.checked)} style={{ marginTop: 2 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--fg)' }}>{candidate.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>#{candidate.id} · {candidate.status}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectSelect({ value, projects, inherited, disabled, onChange }) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value || null)}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, color: disabled ? 'var(--fg3)' : 'var(--fg2)',
        background: disabled ? 'var(--surface)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
        padding: '5px 8px', minWidth: 180,
      }}
    >
      <option value="">{inherited ? 'inherits from parent' : 'no project'}</option>
      {projects.map(project => (
        <option key={project.id} value={project.id}>{project.name} ({project.id})</option>
      ))}
    </select>
  );
}

function RepoList({ project }) {
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

function ProjectManager({ projects, tasks, refresh }) {
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
    const response = await fetch(editingId ? `/api/pi-todo/projects/${editingId}` : '/api/pi-todo/projects', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return;
    load(null);
    refresh();
  }, [draft, editingId, load, parseRepos, refresh]);

  const remove = useCallback(async (projectId) => {
    const response = await fetch(`/api/pi-todo/projects/${projectId}`, { method: 'DELETE' });
    if (!response.ok) return;
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

function TaskCard({ task, allTasks, onSelect, onStatusChange, selectedId }) {
  const subtasks = allTasks.filter(candidate => candidate.parentId === task.id);
  const unresolvedTaskDeps = getUnresolvedDependencies(task, allTasks);
  return (
    <div onClick={() => onSelect(task.id)} style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', cursor: 'pointer',
      borderRadius: 'var(--radius)', border: `1px solid ${selectedId === task.id ? 'var(--accent)' : 'var(--border)'}`,
      background: 'var(--surface)',
    }}>
      <div style={{ fontSize: 13, color: selectedId === task.id ? 'var(--accent)' : 'var(--fg)', fontWeight: 500 }}>{task.title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {task.project && <span style={chip('var(--accent)')}>{task.project.name}</span>}
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

function Column({ status, tasks, allTasks, onSelect, onStatusChange, selectedId }) {
  const meta = STATUS_META[status];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `2px solid color-mix(in srgb, ${meta.color} 35%, transparent)` }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
        <span style={{ ...chip('var(--fg3)'), background: 'var(--surface)' }}>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg3)' }}>—</div> : tasks.map(task => (
        <TaskCard key={task.id} task={task} allTasks={allTasks} onSelect={onSelect} onStatusChange={onStatusChange} selectedId={selectedId} />
      ))}
    </div>
  );
}

function DetailPanel({ taskId, state, refresh, onClose, onStatusChange }) {
  const { tasks, projects } = state;
  const task = tasks.find(candidate => candidate.id === taskId);
  if (!task) return null;
  const parent = task.parentId ? tasks.find(candidate => candidate.id === task.parentId) : null;
  const dependencies = getDependencies(task, tasks);
  const blockedBy = getBlockedBy(task, tasks);
  const subtasks = topologicalSubtasks(tasks.filter(candidate => candidate.parentId === task.id));
  const assignedProject = task.project ?? null;

  const updateTask = useCallback(async (payload) => {
    const response = await fetch(`/api/pi-todo/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) refresh();
  }, [refresh, task.id]);

  const onDependencyChange = useCallback(async (taskId, dependencyId, enabled) => {
    const current = tasks.find(candidate => candidate.id === taskId);
    if (!current) return;
    const nextDependsOnIds = enabled
      ? [...new Set([...(current.dependsOnIds ?? []), dependencyId])]
      : (current.dependsOnIds ?? []).filter(id => id !== dependencyId);
    const response = await fetch(`/api/pi-todo/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependsOnIds: nextDependsOnIds }),
    });
    if (response.ok) refresh();
  }, [refresh, tasks]);

  return (
    <div style={{
      width: 'clamp(340px, 38vw, 760px)', maxWidth: '100%', borderLeft: '1px solid var(--border)', background: 'var(--bg2)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)' }}>#{task.id}</span>
        <div style={{ flex: 1 }} />
        <CopyButton text={`task #${task.id}`} />
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg3)', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>{task.title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusChip taskId={task.id} status={task.status} onStatusChange={onStatusChange} />
          {!task.parentId ? (
            <ProjectSelect value={task.projectId ?? ''} projects={projects} onChange={projectId => updateTask({ projectId })} />
          ) : (
            <ProjectSelect value={assignedProject?.id ?? ''} projects={projects} inherited disabled onChange={() => {}} />
          )}
        </div>

        {assignedProject && (
          <section style={sectionStyle}>
            <SectionTitle>project</SectionTitle>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>{assignedProject.name}</span>
              <span style={chip('var(--accent)')}>{assignedProject.id}</span>
              {task.parentId && <span style={chip('var(--fg3)')}>inherited</span>}
            </div>
            {assignedProject.description && <div style={{ fontSize: 12, color: 'var(--fg2)' }}>{assignedProject.description}</div>}
            <RepoList project={assignedProject} />
          </section>
        )}

        {parent && (
          <section style={sectionStyle}>
            <SectionTitle>parent</SectionTitle>
            <button onClick={() => refresh(parent.id)} style={linkButtonStyle}>{parent.title}</button>
          </section>
        )}

        <section style={sectionStyle}>
          <SectionTitle>dependencies</SectionTitle>
          {!task.parentId && <div style={{ fontSize: 12, color: 'var(--fg3)' }}>Parent tasks only support cross-column status movement. Dependency editing is available for sibling tasks and subtasks.</div>}
          <DependencyEditor task={task} allTasks={tasks} onDependencyChange={onDependencyChange} />
          {dependencies.map(dep => (
            <div key={dep.id} style={rowStyle}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={chip(dep.status === 'done' ? 'var(--idle)' : 'var(--waiting)')}>{dep.status}</span>
                <span style={{ fontSize: 12, color: 'var(--fg)' }}>{dep.title}</span>
              </div>
            </div>
          ))}
          {blockedBy.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase' }}>blocking</div>
              {blockedBy.map(dep => <div key={dep.id} style={rowStyle}><span style={{ fontSize: 12, color: 'var(--fg)' }}>{dep.title}</span></div>)}
            </>
          )}
        </section>

        {task.description && (
          <section style={sectionStyle}>
            <SectionTitle>description</SectionTitle>
            <div style={{ fontSize: 12, color: 'var(--fg2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{task.description}</div>
          </section>
        )}

        {subtasks.length > 0 && (
          <section style={sectionStyle}>
            <SectionTitle>subtasks</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {subtasks.map(subtask => (
                <div key={subtask.id} style={rowStyle}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={chip(STATUS_META[subtask.status].color)}>{STATUS_META[subtask.status].label.split(' ')[0]}</span>
                    <span style={{ fontSize: 12, color: subtask.status === 'done' ? 'var(--fg3)' : 'var(--fg)', textDecoration: subtask.status === 'done' ? 'line-through' : 'none' }}>{subtask.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {task.log.length > 0 && (
          <section style={sectionStyle}>
            <SectionTitle>log</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {task.log.map((entry, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: entry.author === 'pi' ? 'var(--waiting)' : 'var(--idle)' }}>{entry.author}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)' }}>{fmtDate(entry.at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.5 }}>{entry.text}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
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

const buttonStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg2)',
  padding: '4px 10px',
};

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid var(--border)',
};

const rowStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
};

const linkButtonStyle = {
  fontSize: 12,
  color: 'var(--accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left',
};

function SectionTitle({ children }) {
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</div>;
}

export default function TasksPage({ params, setParams }) {
  const [state, setState] = useState({ tasks: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showProjects, setShowProjects] = useState(params.view === 'projects');

  const selectedTaskId = params.task ?? null;
  const activeProject = params.project ?? null;
  const showDone = params.done === '1';

  const refresh = useCallback(async (taskToOpen) => {
    try {
      const response = await fetch('/api/pi-todo/state');
      const next = await response.json();
      setState(next);
      setLoading(false);
      if (taskToOpen) setParams({ ...params, task: taskToOpen });
    } catch {
      setLoading(false);
    }
  }, [setParams]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const visibleTasks = useMemo(() => {
    const filtered = activeProject
      ? state.tasks.filter(task => task.effectiveProjectId === activeProject)
      : state.tasks;
    return showDone ? filtered : filtered.filter(task => task.status !== 'done');
  }, [activeProject, showDone, state.tasks]);

  const parentTasks = visibleTasks.filter(task => !task.parentId);

  const onStatusChange = useCallback(async (taskId, status) => {
    setError(null);
    const response = await fetch(`/api/pi-todo/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? 'Status update failed');
      return;
    }
    refresh();
  }, [refresh]);

  if (loading) return <div style={{ padding: 24, color: 'var(--fg3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {error && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid color-mix(in srgb, var(--waiting) 35%, transparent)', background: 'color-mix(in srgb, var(--waiting) 10%, transparent)', color: 'var(--fg2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setShowProjects(false)} style={{ ...buttonStyle, color: !showProjects ? 'var(--accent)' : 'var(--fg2)' }}>tasks</button>
        <button onClick={() => setShowProjects(true)} style={{ ...buttonStyle, color: showProjects ? 'var(--accent)' : 'var(--fg2)' }}>projects</button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {[null, ...state.projects.map(project => project.id)].map(projectId => {
          const project = state.projects.find(candidate => candidate.id === projectId);
          const active = activeProject === projectId || (!projectId && !activeProject);
          return (
            <button
              key={projectId ?? '__all'}
              onClick={() => setParams({ ...params, project: active ? null : (projectId ?? null) })}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer', padding: '3px 10px', borderRadius: 'var(--radius)',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--fg2)',
              }}
            >
              {project ? project.name : 'all'}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => setParams({ ...params, done: showDone ? null : '1' })} style={{ ...buttonStyle, color: showDone ? 'var(--idle)' : 'var(--fg3)' }}>
          {showDone ? '● hide done' : '● show done'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {showProjects ? (
            <ProjectManager projects={state.projects} tasks={state.tasks} refresh={refresh} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))`, gap: 16, alignItems: 'start' }}>
              {COLUMNS.map(status => (
                <Column
                  key={status}
                  status={status}
                  tasks={parentTasks.filter(task => task.status === status)}
                  allTasks={state.tasks}
                  onSelect={taskId => setParams({ ...params, task: params.task === taskId ? null : taskId })}
                  onStatusChange={onStatusChange}
                  selectedId={selectedTaskId}
                />
              ))}
            </div>
          )}
        </div>

        {!showProjects && selectedTaskId && (
          <DetailPanel
            taskId={selectedTaskId}
            state={state}
            refresh={refresh}
            onStatusChange={onStatusChange}
            onClose={() => setParams({ ...params, task: null })}
          />
        )}
      </div>
    </div>
  );
}
