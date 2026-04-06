import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchState, updateTask } from './lib/api.js';
import { COLUMNS } from './lib/task-meta.js';
import { buttonStyle } from './lib/styles.js';
import { ProjectManager } from './components/projects/ProjectManager.jsx';
import { Column } from './components/tasks/Column.jsx';
import { CreateTaskForm } from './components/tasks/CreateTaskForm.jsx';
import { DetailPanel } from './components/tasks/DetailPanel.jsx';

export default function TasksPage({ params, setParams }) {
  const [state, setState] = useState({ tasks: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showProjects, setShowProjects] = useState(params.view === 'projects');
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const selectedTaskId = params.task ?? null;
  const selectedSubtaskId = params.subtask ?? null;
  const activeProject = params.project ?? null;
  const showDone = params.done === '1';

  const refresh = useCallback(async (taskToOpen) => {
    try {
      const next = await fetchState();
      setState(next);
      setLoading(false);
      if (taskToOpen) setParams({ ...params, task: taskToOpen });
    } catch {
      setLoading(false);
    }
  }, [params, setParams]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Clear subtask param if it doesn't belong to the selected parent
  useEffect(() => {
    if (!selectedSubtaskId || !selectedTaskId) return;
    const subtask = state.tasks.find(t => t.id === selectedSubtaskId);
    if (subtask && subtask.parentId !== selectedTaskId) {
      setParams({ ...params, subtask: null });
    }
  }, [selectedTaskId, selectedSubtaskId, state.tasks]);

  const visibleTasks = useMemo(() => {
    const filtered = activeProject
      ? state.tasks.filter(task => task.effectiveProjectId === activeProject)
      : state.tasks;
    return showDone ? filtered : filtered.filter(task => task.status !== 'done');
  }, [activeProject, showDone, state.tasks]);

  const visibleColumns = showDone ? COLUMNS : COLUMNS.filter(status => status !== 'done');
  const parentTasks = visibleTasks.filter(task => !task.parentId);

  const onStatusChange = useCallback(async (taskId, status) => {
    setError(null);
    const result = await updateTask(taskId, { status });
    if (!result.ok) {
      setError(result.data?.error ?? 'Status update failed');
      return;
    }
    refresh();
  }, [refresh]);

  const onTaskCreated = useCallback((task) => {
    setCreating(false);
    refresh(task.id);
  }, [refresh]);

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {creating && (
        <CreateTaskForm
          projects={state.projects}
          tasks={state.tasks}
          activeProject={activeProject}
          onCreated={onTaskCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {error && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid color-mix(in srgb, var(--waiting) 35%, transparent)', background: 'color-mix(in srgb, var(--waiting) 10%, transparent)', color: 'var(--fg2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setShowProjects(false)} style={{ ...buttonStyle, color: !showProjects ? 'var(--accent)' : 'var(--fg2)' }}>tasks</button>
        <button onClick={() => setShowProjects(true)} style={{ ...buttonStyle, color: showProjects ? 'var(--accent)' : 'var(--fg2)' }}>projects</button>
        <button onClick={() => setCreating(true)} style={{ ...buttonStyle, color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ new task</button>
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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(260px, 1fr))`, gap: 16, alignItems: 'start' }}>
              {visibleColumns.map(status => (
                <Column
                  key={status}
                  status={status}
                  tasks={parentTasks.filter(task => task.status === status)}
                  allTasks={state.tasks}
                  onSelect={taskId => setParams({ ...params, task: params.task === taskId ? null : taskId })}
                  onStatusChange={onStatusChange}
                  selectedId={selectedTaskId}
                  draggingId={draggingId}
                  onDragStart={id => setDraggingId(id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverStatus(null);
                  }}
                  isDragOver={dragOverStatus === status}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOverStatus(status);
                  }}
                  onDragLeave={e => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStatus(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData('text/plain');
                    setDraggingId(null);
                    setDragOverStatus(null);
                    if (taskId) onStatusChange(taskId, status);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {!showProjects && selectedTaskId && (<>
          <DetailPanel
            taskId={selectedTaskId}
            state={state}
            refresh={refresh}
            onStatusChange={onStatusChange}
            onSelectTask={taskId => {
              const clicked = state.tasks.find(t => t.id === taskId);
              if (clicked?.parentId === selectedTaskId) {
                setParams({ ...params, subtask: params.subtask === taskId ? null : taskId });
              } else {
                setParams({ ...params, task: taskId, subtask: null });
              }
            }}
            onClose={() => setParams({ ...params, task: null, subtask: null })}
            onDeleted={() => {
              setParams({ ...params, task: null, subtask: null });
              refresh();
            }}
            activeSubtaskId={selectedSubtaskId}
          />
          {selectedSubtaskId && (
            <DetailPanel
              taskId={selectedSubtaskId}
              state={state}
              refresh={refresh}
              onStatusChange={onStatusChange}
              onSelectTask={taskId => setParams({ ...params, task: taskId, subtask: null })}
              onClose={() => setParams({ ...params, subtask: null })}
              onDeleted={() => {
                setParams({ ...params, subtask: null });
                refresh();
              }}
              isSubtaskDrawer
            />
          )}
        </>)}
      </div>
    </div>
  );
}
