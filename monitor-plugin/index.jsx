import React, { useState, useEffect, useCallback } from 'react';

// ── constants ─────────────────────────────────────────────────────────────────

const COLUMNS = ['open', 'in_progress', 'review', 'done'];

const STATUS_META = {
  open:        { label: '○ open',        color: 'var(--fg2)' },
  in_progress: { label: '◑ in progress', color: 'var(--busy)' },
  review:      { label: '◉ review',      color: 'var(--waiting)' },
  done:        { label: '● done',        color: 'var(--idle)' },
  cancelled:   { label: '✕ cancelled',   color: 'var(--fg3)' },
};

const PRIORITY_META = {
  1: { label: 'p1', color: 'var(--fg3)' },
  2: { label: 'p2', color: 'var(--busy)' },
  3: { label: 'p3', color: 'hsl(0,80%,65%)' },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function chip(color) {
  return {
    fontFamily:  'var(--font-mono)',
    fontSize:    '11px',
    lineHeight:  1,
    color,
    background:  `color-mix(in srgb, ${color} 14%, transparent)`,
    border:      `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    padding:     '2px 7px',
    borderRadius: '4px',
    whiteSpace:  'nowrap',
  };
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusPicker({ current, onSelect }) {
  return (
    <div style={{
      position:    'absolute',
      top:         '100%',
      left:        0,
      marginTop:   4,
      background:  'var(--surface2)',
      border:      '1px solid var(--border2)',
      borderRadius: 'var(--radius)',
      padding:     '4px',
      zIndex:      100,
      display:     'flex',
      flexDirection: 'column',
      gap:         3,
      minWidth:    130,
    }}>
      {Object.entries(STATUS_META).map(([s, m]) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          style={{
            ...chip(m.color),
            display:   'block',
            width:     '100%',
            textAlign: 'left',
            cursor:    'pointer',
            border:    s === current
              ? `1px solid color-mix(in srgb, ${m.color} 50%, transparent)`
              : `1px solid color-mix(in srgb, ${m.color} 28%, transparent)`,
            background: s === current
              ? `color-mix(in srgb, ${m.color} 22%, transparent)`
              : `color-mix(in srgb, ${m.color} 10%, transparent)`,
            padding:   '4px 8px',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function SubtaskRow({ task, onStatusChange }) {
  const sm = STATUS_META[task.status];
  const [picking, setPicking] = useState(false);

  const handleSelect = useCallback((newStatus) => {
    setPicking(false);
    if (newStatus !== task.status) onStatusChange(task.id, newStatus);
  }, [task.id, task.status, onStatusChange]);

  return (
    <div style={{
      display:    'flex',
      alignItems: 'flex-start',
      gap:        8,
      padding:    '5px 0',
      borderTop:  '1px solid var(--border)',
    }}>
      {/* status dot — clickable */}
      <div style={{ position: 'relative', flexShrink: 0, paddingTop: 1 }}>
        <span
          onClick={() => setPicking(p => !p)}
          style={{ ...chip(sm.color), cursor: 'pointer', userSelect: 'none', padding: '2px 6px' }}
          title={sm.label}
        >
          {sm.label.split(' ')[0]}
        </span>
        {picking && (
          <>
            <div onClick={() => setPicking(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <StatusPicker current={task.status} onSelect={handleSelect} />
          </>
        )}
      </div>
      {/* title */}
      <span style={{
        fontSize:   '12px',
        color:      task.status === 'done' ? 'var(--fg3)' : 'var(--fg2)',
        lineHeight: 1.4,
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </div>
  );
}

function TaskCard({ task, allTasks, onStatusChange }) {
  const [picking, setPicking]   = useState(false);
  const [expanded, setExpanded] = useState(false);
  const subtasks = allTasks.filter(t => t.parentId === task.id);
  const doneCount = subtasks.filter(t => t.status === 'done').length;
  const sm = STATUS_META[task.status];
  const pm = PRIORITY_META[task.priority];

  const handleSelect = useCallback((newStatus) => {
    setPicking(false);
    if (newStatus !== task.status) onStatusChange(task.id, newStatus);
  }, [task.id, task.status, onStatusChange]);

  return (
    <div style={{
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  'var(--radius)',
      padding:       '10px 12px',
      display:       'flex',
      flexDirection: 'column',
      gap:           7,
    }}>
      {/* title */}
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg)', lineHeight: 1.35 }}>
        {task.title}
      </div>

      {/* chips row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <span style={chip(pm.color)}>{pm.label}</span>
        {task.tags.map(tag => (
          <span key={tag} style={chip('var(--accent)')}>#{tag}</span>
        ))}
        {task.log.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg3)' }}>
            {task.log.length} note{task.log.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* status + subtask toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* status chip */}
        <div style={{ position: 'relative' }}>
          <span
            onClick={() => setPicking(p => !p)}
            style={{ ...chip(sm.color), cursor: 'pointer', userSelect: 'none' }}
          >
            {sm.label} ▾
          </span>
          {picking && (
            <>
              <div onClick={() => setPicking(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <StatusPicker current={task.status} onSelect={handleSelect} />
            </>
          )}
        </div>

        {/* subtask toggle */}
        {subtasks.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              fontFamily:   'var(--font-mono)',
              fontSize:     '11px',
              cursor:       'pointer',
              padding:      '2px 7px',
              borderRadius: '4px',
              border:       '1px solid var(--border)',
              background:   'transparent',
              color:        doneCount === subtasks.length ? 'var(--idle)' : 'var(--fg3)',
            }}
          >
            {expanded ? '▴' : '▾'} {doneCount}/{subtasks.length} subtasks
          </button>
        )}
      </div>

      {/* subtask list — expanded */}
      {expanded && subtasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {subtasks.map(sub => (
            <SubtaskRow key={sub.id} task={sub} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({ status, tasks, allTasks, onStatusChange }) {
  const sm = STATUS_META[status];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {/* column header */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        paddingBottom: 8,
        borderBottom: `2px solid color-mix(in srgb, ${sm.color} 40%, transparent)`,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: sm.color, fontWeight: 600 }}>
          {sm.label}
        </span>
        <span style={{
          fontFamily:  'var(--font-mono)',
          fontSize:    '11px',
          color:       'var(--fg3)',
          background:  'var(--surface)',
          border:      '1px solid var(--border)',
          borderRadius: '10px',
          padding:     '1px 7px',
        }}>
          {tasks.length}
        </span>
      </div>

      {/* cards */}
      {tasks.length === 0
        ? <div style={{ color: 'var(--fg3)', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '8px 0' }}>—</div>
        : tasks.map(t => (
            <TaskCard key={t.id} task={t} allTasks={allTasks} onStatusChange={onStatusChange} />
          ))
      }
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTag, setActiveTag] = useState(null);
  const [showDone, setShowDone]   = useState(false);

  const fetchTasks = useCallback(() => {
    fetch('/api/pi-todo/tasks')
      .then(r => r.json())
      .then(data => { setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTasks();
    const id = setInterval(fetchTasks, 5000);
    return () => clearInterval(id);
  }, [fetchTasks]);

  const handleStatusChange = useCallback(async (id, status) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    try {
      await fetch(`/api/pi-todo/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      });
    } catch {
      fetchTasks(); // revert on error
    }
  }, [fetchTasks]);

  // all unique tags
  const allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();

  // filtered task set
  const visible = activeTag ? tasks.filter(t => t.tags.includes(activeTag)) : tasks;

  // columns to render
  const columns = showDone ? COLUMNS : COLUMNS.filter(s => s !== 'done');

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── filter bar ───────────────────────────────────────────────── */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        padding:    '12px 20px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        flexWrap:   'wrap',
      }}>
        {/* tag filters */}
        <button
          onClick={() => setActiveTag(null)}
          style={{
            fontFamily:   'var(--font-mono)',
            fontSize:     '12px',
            cursor:       'pointer',
            padding:      '3px 10px',
            borderRadius: 'var(--radius)',
            border:       activeTag === null ? '1px solid var(--accent)' : '1px solid var(--border)',
            background:   activeTag === null ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
            color:        activeTag === null ? 'var(--accent)' : 'var(--fg2)',
          }}
        >
          all
        </button>
        {allTags.map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            style={{
              fontFamily:   'var(--font-mono)',
              fontSize:     '12px',
              cursor:       'pointer',
              padding:      '3px 10px',
              borderRadius: 'var(--radius)',
              border:       activeTag === tag ? '1px solid var(--accent)' : '1px solid var(--border)',
              background:   activeTag === tag ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
              color:        activeTag === tag ? 'var(--accent)' : 'var(--fg2)',
            }}
          >
            #{tag}
          </button>
        ))}

        {/* spacer */}
        <div style={{ flex: 1 }} />

        {/* show done toggle */}
        <button
          onClick={() => setShowDone(v => !v)}
          style={{
            fontFamily:   'var(--font-mono)',
            fontSize:     '11px',
            cursor:       'pointer',
            padding:      '3px 10px',
            borderRadius: 'var(--radius)',
            border:       '1px solid var(--border)',
            background:   showDone ? 'color-mix(in srgb, var(--idle) 12%, transparent)' : 'transparent',
            color:        showDone ? 'var(--idle)' : 'var(--fg3)',
          }}
        >
          {showDone ? '● hide done' : '● show done'}
        </button>
      </div>

      {/* ── board ─────────────────────────────────────────────────────── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
        gap:                 16,
        padding:             '16px 20px',
        flex:                1,
        overflowY:           'auto',
        alignItems:          'start',
      }}>
        {columns.map(status => (
          <Column
            key={status}
            status={status}
            tasks={visible.filter(t => t.status === status && !t.parentId)}
            allTasks={tasks}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  );
}
