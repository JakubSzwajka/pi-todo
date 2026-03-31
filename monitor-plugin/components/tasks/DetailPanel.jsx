import React, { useCallback } from 'react';
import { deleteTask, updateTask } from '../../lib/api.js';
import { STATUS_META } from '../../lib/task-meta.js';
import { fmtDate, getBlockedBy, getDependencies, topologicalSubtasks } from '../../lib/task-utils.js';
import { chip, linkButtonStyle, rowStyle, sectionStyle } from '../../lib/styles.js';
import { CopyButton } from '../common/CopyButton.jsx';
import { ProjectSelect } from '../common/ProjectSelect.jsx';
import { RepoList } from '../common/RepoList.jsx';
import { SectionTitle } from '../common/SectionTitle.jsx';
import { StatusChip } from '../common/StatusChip.jsx';
import { TagEditor } from '../common/TagEditor.jsx';

function DependencyEditor({ task, allTasks, onDependencyChange }) {
  const [open, setOpen] = React.useState(false);
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

export function DetailPanel({ taskId, state, refresh, onClose, onStatusChange, onDeleted, onSelectTask }) {
  const { tasks, projects } = state;
  const task = tasks.find(candidate => candidate.id === taskId);
  if (!task) return null;

  const parent = task.parentId ? tasks.find(candidate => candidate.id === task.parentId) : null;
  const dependencies = getDependencies(task, tasks);
  const blockedBy = getBlockedBy(task, tasks);
  const subtasks = topologicalSubtasks(tasks.filter(candidate => candidate.parentId === task.id));
  const assignedProject = task.project ?? null;

  const patchTask = useCallback(async (payload) => {
    const result = await updateTask(task.id, payload);
    if (result.ok) refresh();
  }, [refresh, task.id]);

  const addTag = useCallback((tag) => patchTask({ addTag: tag }), [patchTask]);
  const removeTag = useCallback((tag) => patchTask({ removeTag: tag }), [patchTask]);

  const onDependencyChange = useCallback(async (editedTaskId, dependencyId, enabled) => {
    const current = tasks.find(candidate => candidate.id === editedTaskId);
    if (!current) return;
    const nextDependsOnIds = enabled
      ? [...new Set([...(current.dependsOnIds ?? []), dependencyId])]
      : (current.dependsOnIds ?? []).filter(id => id !== dependencyId);
    const result = await updateTask(editedTaskId, { dependsOnIds: nextDependsOnIds });
    if (result.ok) refresh();
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
        <button onClick={async () => {
          if (!confirm(`Delete task "${task.title}"?`)) return;
          const result = await deleteTask(task.id);
          if (result.ok) onDeleted();
        }} style={{ background: 'transparent', border: 'none', color: 'hsl(0,60%,55%)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11 }}>delete</button>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg3)', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4 }}>{task.title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusChip taskId={task.id} status={task.status} onStatusChange={onStatusChange} />
          {!task.parentId ? (
            <ProjectSelect value={task.projectId ?? ''} projects={projects} onChange={projectId => patchTask({ projectId })} />
          ) : (
            <ProjectSelect value={assignedProject?.id ?? ''} projects={projects} inherited disabled onChange={() => {}} />
          )}
        </div>

        <section style={sectionStyle}>
          <SectionTitle>tags</SectionTitle>
          <TagEditor tags={task.tags ?? []} onAddTag={addTag} onRemoveTag={removeTag} />
        </section>

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
            <button onClick={() => onSelectTask(parent.id)} style={linkButtonStyle}>{parent.title}</button>
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
                <button
                  key={subtask.id}
                  onClick={() => onSelectTask(subtask.id)}
                  style={{
                    ...rowStyle,
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={chip(STATUS_META[subtask.status].color)}>{STATUS_META[subtask.status].label.split(' ')[0]}</span>
                    <span style={{ fontSize: 12, color: subtask.status === 'done' ? 'var(--fg3)' : 'var(--fg)', textDecoration: subtask.status === 'done' ? 'line-through' : 'none' }}>
                      {subtask.title}
                    </span>
                  </div>
                </button>
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
