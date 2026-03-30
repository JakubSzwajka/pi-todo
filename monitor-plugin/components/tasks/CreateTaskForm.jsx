import React, { useCallback, useMemo, useState } from 'react';
import { createTask } from '../../lib/api.js';
import { buttonStyle, formLabelStyle, inputStyle } from '../../lib/styles.js';

export function CreateTaskForm({ projects, tasks, activeProject, onCreated, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(activeProject ?? '');
  const [parentId, setParentId] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const activeTasks = useMemo(() => tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && !t.parentId), [tasks]);

  const submit = useCallback(async () => {
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    setSaving(true);
    setFormError(null);
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      projectId: parentId ? undefined : (projectId || undefined),
      parentId: parentId || undefined,
      tags,
    };

    try {
      const result = await createTask(payload);
      if (!result.ok) {
        setFormError(result.data?.error ?? 'Failed to create task');
        setSaving(false);
        return;
      }
      onCreated(result.data);
    } catch {
      setFormError('Network error');
      setSaving(false);
    }
  }, [title, description, projectId, parentId, tagsText, onCreated]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'clamp(360px, 50vw, 520px)', background: 'var(--bg2)',
        border: '1px solid var(--border2)', borderRadius: 'var(--radius)',
        padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg)', fontWeight: 600 }}>new task</div>

        {formError && (
          <div style={{ fontSize: 12, color: 'hsl(0,70%,60%)', fontFamily: 'var(--font-mono)', padding: '6px 10px', background: 'color-mix(in srgb, hsl(0,70%,60%) 10%, transparent)', borderRadius: 6, border: '1px solid color-mix(in srgb, hsl(0,70%,60%) 28%, transparent)' }}>
            {formError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={formLabelStyle}>title *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(); if (e.key === 'Escape') onCancel(); }}
            placeholder="Task title"
            autoFocus
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={formLabelStyle}>description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
            placeholder="Optional description"
            rows={3}
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={formLabelStyle}>project</label>
            <select
              value={parentId ? '' : projectId}
              disabled={!!parentId}
              onChange={e => setProjectId(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px' }}
            >
              <option value="">no project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={formLabelStyle}>parent task</label>
            <select
              value={parentId}
              onChange={e => setParentId(e.target.value)}
              style={{ ...inputStyle, padding: '6px 8px' }}
            >
              <option value="">none (top-level)</option>
              {activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={formLabelStyle}>tags (comma-separated)</label>
          <input
            value={tagsText}
            onChange={e => setTagsText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
            placeholder="e.g. bug, urgent"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onCancel} style={buttonStyle}>cancel</button>
          <button onClick={submit} disabled={saving} style={{ ...buttonStyle, color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {saving ? 'creating…' : 'create task'}
          </button>
        </div>
      </div>
    </div>
  );
}
