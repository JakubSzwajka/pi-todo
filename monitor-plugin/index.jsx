import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── constants ─────────────────────────────────────────────────────────────────

const COLUMNS = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done'];

const STATUS_META = {
  open:        { label: '○ open',        color: 'var(--fg2)' },
  in_progress: { label: '◑ in progress', color: 'var(--busy)' },
  review:      { label: '◉ review',      color: 'var(--waiting)' },
  testing:     { label: '⬡ testing',     color: 'hsl(280,60%,65%)' },
  waiting:     { label: '◌ waiting',     color: 'hsl(25,80%,60%)' },
  done:        { label: '● done',        color: 'var(--idle)' },
  cancelled:   { label: '✕ cancelled',   color: 'var(--fg3)' },
};

// ── helpers ───────────────────────────────────────────────────────────────────

function chip(color, extra) {
  return {
    fontFamily:   'var(--font-mono)',
    fontSize:     '11px',
    lineHeight:   1,
    color,
    background:   `color-mix(in srgb, ${color} 14%, transparent)`,
    border:       `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
    padding:      '2px 7px',
    borderRadius: '4px',
    whiteSpace:   'nowrap',
    maxWidth:     '100%',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
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
  return getDependencies(task, allTasks).filter(candidate => candidate.status !== 'done');
}

// Sort a set of sibling subtasks in dependency order (parents before children).
// Handles cycles by visiting remaining tasks at the end.
function topoSortSubtasks(subtasks) {
  const ids = new Set(subtasks.map(t => t.id));
  const visited = new Set();
  const result = [];
  function visit(task) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const depId of (task.dependsOnIds ?? [])) {
      if (!ids.has(depId)) continue;
      const dep = subtasks.find(t => t.id === depId);
      if (dep) visit(dep);
    }
    result.push(task);
  }
  for (const t of subtasks) visit(t);
  return result;
}

function DependencySelect({ task, candidates, onDependencyChange }) {
  const [open, setOpen] = useState(false);
  const selectedCount = (task.dependsOnIds ?? []).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          cursor: 'pointer',
          padding: '4px 10px',
          borderRadius: '6px',
          border: '1px solid var(--border)',
          background: open ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)',
          color: open ? 'var(--accent)' : 'var(--fg2)',
        }}
      >
        dependencies ▾ {selectedCount > 0 ? `(${selectedCount})` : ''}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 100,
            minWidth: 320,
            maxWidth: 460,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--surface2)',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--radius)',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}>
            {candidates.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--fg3)' }}>No sibling tasks available.</div>
            ) : candidates.map(candidate => {
              const selected = (task.dependsOnIds ?? []).includes(candidate.id);
              const blocked = candidate.status !== 'done';
              return (
                <label
                  key={candidate.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: '6px',
                    background: selected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={e => onDependencyChange(task.id, candidate.id, e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '12px', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{candidate.title}</span>
                    <span style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>
                      #{candidate.id} · {candidate.status}{blocked ? ' · unfinished' : ''}
                    </span>
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

// ── StatusPicker ──────────────────────────────────────────────────────────────

function StatusPicker({ current, onSelect }) {
  return (
    <div style={{
      position:      'absolute',
      top:           '100%',
      left:          0,
      marginTop:     4,
      background:    'var(--surface2)',
      border:        '1px solid var(--border2)',
      borderRadius:  'var(--radius)',
      padding:       '4px',
      zIndex:        100,
      display:       'flex',
      flexDirection: 'column',
      gap:           3,
      minWidth:      130,
    }}>
      {Object.entries(STATUS_META).map(([s, m]) => (
        <button key={s} onClick={() => onSelect(s)} style={{
          ...chip(m.color),
          display:    'block',
          width:      '100%',
          textAlign:  'left',
          cursor:     'pointer',
          border:     `1px solid color-mix(in srgb, ${m.color} ${s === current ? 50 : 28}%, transparent)`,
          background: `color-mix(in srgb, ${m.color} ${s === current ? 22 : 10}%, transparent)`,
          padding:    '4px 8px',
        }}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── StatusChip (inline clickable) ─────────────────────────────────────────────

function StatusChip({ taskId, status, onStatusChange }) {
  const [picking, setPicking] = useState(false);
  const sm = STATUS_META[status];

  const handleSelect = useCallback((newStatus) => {
    setPicking(false);
    if (newStatus !== status) onStatusChange(taskId, newStatus);
  }, [taskId, status, onStatusChange]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span onClick={() => setPicking(p => !p)}
        style={{ ...chip(sm.color), cursor: 'pointer', userSelect: 'none' }}>
        {sm.label} ▾
      </span>
      {picking && (
        <>
          <div onClick={() => setPicking(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <StatusPicker current={status} onSelect={handleSelect} />
        </>
      )}
    </div>
  );
}

// ── SubtaskRow (in board card) ────────────────────────────────────────────────

function SubtaskRow({ task, allTasks, onStatusChange, onSelect }) {
  const sm = STATUS_META[task.status];
  const [picking, setPicking] = useState(false);
  const dependencies = getDependencies(task, allTasks);
  const unresolved = dependencies.filter(candidate => candidate.status !== 'done');

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
      <div style={{ position: 'relative', flexShrink: 0, paddingTop: 1 }}>
        <span onClick={() => setPicking(p => !p)}
          style={{ ...chip(sm.color), cursor: 'pointer', userSelect: 'none', padding: '2px 6px' }}
          title={sm.label}>
          {sm.label.split(' ')[0]}
        </span>
        {picking && (
          <>
            <div onClick={() => setPicking(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <StatusPicker current={task.status} onSelect={handleSelect} />
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span
          onClick={() => onSelect(task.id)}
          style={{
            fontSize:       '12px',
            color:          task.status === 'done' ? 'var(--fg3)' : 'var(--fg2)',
            lineHeight:     1.4,
            textDecoration: task.status === 'done' ? 'line-through' : 'none',
            cursor:         'pointer',
            minWidth:       0,
            overflowWrap:   'anywhere',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--accent)'}
          onMouseLeave={e => e.target.style.color = task.status === 'done' ? 'var(--fg3)' : 'var(--fg2)'}
        >
          {task.title}
        </span>
        {(dependencies.length > 0 || unresolved.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {unresolved.length > 0 && <span style={chip('var(--waiting)')}>blocked</span>}
            {dependencies.map(dep => (
              <span key={dep.id} style={chip(dep.status === 'done' ? 'var(--idle)' : 'var(--fg3)', { maxWidth: 180 })} title={`${dep.title} — ${dep.status}`}>
                ← {dep.title}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TaskCard (in board) ───────────────────────────────────────────────────────

function TaskCard({ task, allTasks, onStatusChange, onSelect, isSelected, draggingId, onDragStart, onDragEnd }) {
  const [expanded, setExpanded] = useState(false);
  const subtasks  = allTasks.filter(t => t.parentId === task.id);
  const doneCount = subtasks.filter(t => t.status === 'done').length;
  const blockedSubtaskCount = subtasks.filter(t => getUnresolvedDependencies(t, allTasks).length > 0).length;
  const taskDependencies = getDependencies(task, allTasks);
  const unresolvedTaskDependencies = taskDependencies.filter(t => t.status !== 'done');
  const isDragging = draggingId === task.id;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(task.id); }}
      onDragEnd={onDragEnd}
      style={{
        background:    'var(--surface)',
        border:        `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius:  'var(--radius)',
        padding:       '10px 12px',
        display:       'flex',
        flexDirection: 'column',
        gap:           7,
        opacity:       isDragging ? 0.4 : 1,
        cursor:        'grab',
        transition:    'opacity 0.15s',
      }}>
      {/* title — clickable */}
      <div
        onClick={() => onSelect(task.id)}
        style={{
          fontSize:     '13px',
          fontWeight:   500,
          color:        isSelected ? 'var(--accent)' : 'var(--fg)',
          lineHeight:   1.35,
          cursor:       'pointer',
          minWidth:     0,
          overflowWrap: 'anywhere',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.color = 'var(--accent)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.color = 'var(--fg)'; }}
      >
        {task.title}
      </div>

      {/* chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', minWidth: 0 }}>
        {task.tags.map(tag => (
          <span key={tag} style={chip('var(--accent)', { maxWidth: '100%' })}>#{tag}</span>
        ))}
        {unresolvedTaskDependencies.length > 0 && (
          <span style={chip('var(--waiting)')}>blocked by {unresolvedTaskDependencies.length}</span>
        )}
        {blockedSubtaskCount > 0 && (
          <span style={chip('hsl(25,80%,60%)')}>{blockedSubtaskCount} blocked subtask{blockedSubtaskCount !== 1 ? 's' : ''}</span>
        )}
        {task.log.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg3)' }}>
            {task.log.length} note{task.log.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* status + subtask toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <StatusChip taskId={task.id} status={task.status} onStatusChange={onStatusChange} />
        {subtasks.length > 0 && (
          <button onClick={() => setExpanded(v => !v)} style={{
            fontFamily:   'var(--font-mono)',
            fontSize:     '11px',
            cursor:       'pointer',
            padding:      '2px 7px',
            borderRadius: '4px',
            border:       '1px solid var(--border)',
            background:   'transparent',
            color:        doneCount === subtasks.length ? 'var(--idle)' : 'var(--fg3)',
            maxWidth:     '100%',
          }}>
            {expanded ? '▴' : '▾'} {doneCount}/{subtasks.length} subtasks
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }} />
        <CopyButton text={`task #${task.id}`} />
      </div>

      {taskDependencies.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
          {taskDependencies.map(dep => (
            <span key={dep.id} style={chip(dep.status === 'done' ? 'var(--idle)' : 'var(--fg3)', { maxWidth: '100%' })} title={`${dep.title} — ${dep.status}`}>
              depends on ← {dep.title}
            </span>
          ))}
        </div>
      )}

      {/* subtask list */}
      {expanded && subtasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {subtasks.map(sub => (
            <SubtaskRow key={sub.id} task={sub} allTasks={allTasks} onStatusChange={onStatusChange} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({ status, tasks, allTasks, onStatusChange, onSelect, selectedId, draggingId, onDragStart, onDragEnd, isDragOver, onDragOver, onDragLeave, onDrop }) {
  const sm = STATUS_META[status];
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        minWidth:      0,
        borderRadius:  'var(--radius)',
        outline:       isDragOver ? `2px dashed color-mix(in srgb, ${sm.color} 60%, transparent)` : '2px dashed transparent',
        transition:    'outline 0.1s',
        padding:       isDragOver ? '4px' : '4px',
      }}>
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        paddingBottom: 8,
        borderBottom: `2px solid color-mix(in srgb, ${sm.color} ${isDragOver ? 80 : 40}%, transparent)`,
        transition:   'border-color 0.1s',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: sm.color, fontWeight: 600 }}>
          {sm.label}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg3)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '1px 7px',
        }}>
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0
        ? <div style={{
            color: isDragOver ? sm.color : 'var(--fg3)',
            fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '8px 0',
            transition: 'color 0.1s',
          }}>
            {isDragOver ? '⊕ drop here' : '—'}
          </div>
        : tasks.map(t => (
            <TaskCard
              key={t.id} task={t} allTasks={allTasks}
              onStatusChange={onStatusChange} onSelect={onSelect}
              isSelected={selectedId === t.id}
              draggingId={draggingId} onDragStart={onDragStart} onDragEnd={onDragEnd}
            />
          ))
      }
      {/* drop target hint when column has cards */}
      {tasks.length > 0 && isDragOver && (
        <div style={{
          border:       `1px dashed color-mix(in srgb, ${sm.color} 50%, transparent)`,
          borderRadius: 'var(--radius)',
          padding:      '8px',
          textAlign:    'center',
          fontFamily:   'var(--font-mono)',
          fontSize:     '11px',
          color:        sm.color,
        }}>
          ⊕ drop here
        </div>
      )}
    </div>
  );
}

// ── Description renderer ──────────────────────────────────────────────────────

function Description({ text }) {
  if (!text) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## '))
          return <div key={i} style={{ fontWeight: 600, color: 'var(--fg)', fontSize: '12px', marginTop: 8 }}>{line.slice(3)}</div>;
        if (line.startsWith('# '))
          return <div key={i} style={{ fontWeight: 700, color: 'var(--fg)', fontSize: '13px', marginTop: 8 }}>{line.slice(2)}</div>;
        if (line.startsWith('- '))
          return <div key={i} style={{ display: 'flex', gap: 6, fontSize: '12px', color: 'var(--fg2)' }}>
            <span style={{ color: 'var(--fg3)', flexShrink: 0 }}>–</span><span>{line.slice(2)}</span>
          </div>;
        if (line === '')
          return <div key={i} style={{ height: 4 }} />;
        return <div key={i} style={{ fontSize: '12px', color: 'var(--fg2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{line}</div>;
      })}
    </div>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handle = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button onClick={handle} title={`Copy: ${text}`} style={{
      fontFamily:   'var(--font-mono)',
      fontSize:     '11px',
      cursor:       'pointer',
      padding:      '2px 8px',
      borderRadius: '4px',
      border:       `1px solid ${copied ? 'color-mix(in srgb, var(--idle) 40%, transparent)' : 'var(--border)'}`,
      background:    copied ? 'color-mix(in srgb, var(--idle) 12%, transparent)' : 'transparent',
      color:         copied ? 'var(--idle)' : 'var(--fg3)',
      transition:   'all 0.15s',
    }}>
      {copied ? '✓ copied' : '⎘ copy ref'}
    </button>
  );
}

// ── DetailPanel ───────────────────────────────────────────────────────────────

function DetailPanel({ taskId, allTasks, onStatusChange, onDependencyChange, onClose, isOpen }) {
  const [history, setHistory] = useState([taskId]);
  const currentId = history[history.length - 1];
  const task = allTasks.find(t => t.id === currentId);

  // Reset history when a new task is selected from outside
  useEffect(() => {
    setHistory([taskId]);
  }, [taskId]);

  const navigate = useCallback((id) => {
    setHistory(h => [...h, id]);
  }, []);

  const goBack = useCallback(() => {
    setHistory(h => h.slice(0, -1));
  }, []);

  if (!task) return null;

  const parent   = task.parentId ? allTasks.find(t => t.id === task.parentId) : null;
  const subtasks = allTasks.filter(t => t.parentId === task.id);
  const dependencies = getDependencies(task, allTasks);
  const blockedBy = getBlockedBy(task, allTasks);
  const unresolvedDependencies = dependencies.filter(t => t.status !== 'done');
  const dependencyCandidates = allTasks.filter(candidate => candidate.id !== task.id && candidate.parentId === task.parentId);

  const sectionLabel = {
    fontFamily:    'var(--font-mono)',
    fontSize:      '10px',
    color:         'var(--fg3)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom:  6,
  };

  const divider = {
    borderTop: '1px solid var(--border)',
    paddingTop: 14,
    marginTop:  2,
  };

  return (
    <div style={{
      width:         '100%',
      height:        '100%',
      maxWidth:      '100%',
      minWidth:      0,
      flexShrink:    0,
      borderLeft:    '1px solid var(--border)',
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      background:    'var(--bg2)',
      opacity:       isOpen ? 1 : 0,
      transform:     isOpen ? 'translateX(0)' : 'translateX(16px)',
      transition:    'opacity 180ms ease, transform 180ms ease',
    }}>
      {/* header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '10px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink:   0,
        flexWrap:     'wrap',
        minWidth:     0,
      }}>
        {history.length > 1 && (
          <button onClick={goBack} style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px', cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: '4px', color: 'var(--fg2)', padding: '2px 8px',
          }}>← back</button>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--fg3)' }}>
          #{task.id}
        </span>
        <div style={{ flex: 1 }} />
        <CopyButton text={`task #${task.id}`} />
        <button onClick={onClose} style={{
          fontFamily: 'var(--font-mono)', fontSize: '13px', cursor: 'pointer',
          background: 'transparent', border: 'none', color: 'var(--fg3)', lineHeight: 1,
          padding: '2px 4px',
        }}>✕</button>
      </div>

      {/* scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

        {/* title */}
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
          {task.title}
        </div>

        {/* meta chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          <StatusChip taskId={task.id} status={task.status} onStatusChange={onStatusChange} />
          {task.tags.map(tag => <span key={tag} style={chip('var(--accent)', { maxWidth: '100%' })}>#{tag}</span>)}
          {unresolvedDependencies.length > 0 && <span style={chip('var(--waiting)')}>blocked</span>}
        </div>

        {/* parent link */}
        {parent && (
          <div style={divider}>
            <div style={sectionLabel}>parent</div>
            <div
              onClick={() => navigate(parent.id)}
              style={{
                fontSize: '12px', color: 'var(--fg2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--fg2)'}
            >
              <span style={{ color: 'var(--fg3)', flexShrink: 0 }}>↑</span>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{parent.title}</span>
            </div>
          </div>
        )}

        {/* dependencies */}
        {(dependencies.length > 0 || blockedBy.length > 0 || dependencyCandidates.length > 0) && (
          <div style={divider}>
            <div style={sectionLabel}>dependencies</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dependencyCandidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>edit dependencies</div>
                  <DependencySelect
                    task={task}
                    candidates={dependencyCandidates}
                    onDependencyChange={onDependencyChange}
                  />
                </div>
              )}
              {dependencies.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>depends on</div>
                  {dependencies.map(dep => {
                    const blocked = dep.status !== 'done';
                    return (
                      <div
                        key={dep.id}
                        onClick={() => navigate(dep.id)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                          background: 'var(--surface)', border: `1px solid ${blocked ? 'color-mix(in srgb, var(--waiting) 40%, transparent)' : 'var(--border)'}`,
                        }}
                      >
                        <span style={{ ...chip(blocked ? 'var(--waiting)' : 'var(--idle)'), flexShrink: 0, padding: '2px 5px' }}>
                          {blocked ? 'blocked' : 'ready'}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: '12px', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{dep.title}</span>
                          <span style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>#{dep.id} · {dep.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {blockedBy.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>blocking</div>
                  {blockedBy.map(dep => (
                    <div
                      key={dep.id}
                      onClick={() => navigate(dep.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                        background: 'var(--surface)', border: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ ...chip(dep.status === 'done' ? 'var(--idle)' : 'var(--fg3)'), flexShrink: 0, padding: '2px 5px' }}>
                        {dep.status}
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: '12px', color: 'var(--fg)', overflowWrap: 'anywhere' }}>{dep.title}</span>
                        <span style={{ fontSize: '11px', color: 'var(--fg3)', fontFamily: 'var(--font-mono)' }}>#{dep.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* description */}
        {task.description && (
          <div style={divider}>
            <div style={sectionLabel}>description</div>
            <Description text={task.description} />
          </div>
        )}

        {/* subtasks */}
        {subtasks.length > 0 && (() => {
          const sibIds = new Set(subtasks.map(t => t.id));
          const sorted = topoSortSubtasks(subtasks);

          // Compute depth: 0 for roots, max(parent depths)+1 for children
          const depths = {};
          for (const sub of sorted) {
            const sibDeps = (sub.dependsOnIds ?? []).filter(id => sibIds.has(id));
            depths[sub.id] = sibDeps.length === 0
              ? 0
              : Math.max(...sibDeps.map(id => depths[id] ?? 0)) + 1;
          }

          const INDENT = 18;

          return (
            <div style={divider}>
              <div style={sectionLabel}>
                subtasks — {subtasks.filter(t => t.status === 'done').length}/{subtasks.length} done
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {sorted.map(sub => {
                  const depth = depths[sub.id] ?? 0;
                  const sibDeps = (sub.dependsOnIds ?? []).filter(id => sibIds.has(id));
                  const isBlocked = sibDeps.some(id => subtasks.find(t => t.id === id)?.status !== 'done');
                  const sm = STATUS_META[sub.status];
                  const connColor = isBlocked
                    ? 'color-mix(in srgb, var(--waiting) 55%, transparent)'
                    : 'var(--border2)';

                  return (
                    <div key={sub.id} style={{ display: 'flex', alignItems: 'center' }}>

                      {/* tree connector */}
                      {depth > 0 && (
                        <div style={{
                          flexShrink: 0,
                          width:      depth * INDENT,
                          height:     32,
                          position:   'relative',
                        }}>
                          {/* vertical segment from parent */}
                          <div style={{
                            position:   'absolute',
                            left:       (depth - 1) * INDENT + 9,
                            top:        0,
                            width:      1.5,
                            height:     16,
                            background: connColor,
                          }} />
                          {/* horizontal elbow */}
                          <div style={{
                            position:     'absolute',
                            left:         (depth - 1) * INDENT + 9,
                            top:          16,
                            width:        INDENT - 9 + 4,
                            height:       1.5,
                            background:   connColor,
                            borderRadius: '0 0 0 2px',
                          }} />
                        </div>
                      )}

                      {/* task row */}
                      <div
                        onClick={() => navigate(sub.id)}
                        style={{
                          flex:         1,
                          display:      'flex',
                          alignItems:   'center',
                          gap:          8,
                          padding:      '6px 10px',
                          borderRadius: '6px',
                          cursor:       'pointer',
                          background:   'var(--surface)',
                          border:       `1px solid ${isBlocked ? 'color-mix(in srgb, var(--waiting) 35%, transparent)' : 'var(--border)'}`,
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = isBlocked ? 'color-mix(in srgb, var(--waiting) 55%, transparent)' : 'var(--border2)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = isBlocked ? 'color-mix(in srgb, var(--waiting) 35%, transparent)' : 'var(--border)'}
                      >
                        <span style={{ ...chip(sm.color), padding: '2px 5px', flexShrink: 0 }}>
                          {sm.label.split(' ')[0]}
                        </span>
                        <span style={{
                          fontSize:       '12px',
                          color:          sub.status === 'done' ? 'var(--fg3)' : 'var(--fg)',
                          textDecoration: sub.status === 'done' ? 'line-through' : 'none',
                          lineHeight:     1.4,
                          flex:           1,
                          overflowWrap:   'anywhere',
                        }}>
                          {sub.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* log */}
        {task.log.length > 0 && (
          <div style={divider}>
            <div style={sectionLabel}>log</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {task.log.map((entry, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '10px',
                      color: entry.author === 'pi' ? 'var(--waiting)' : 'var(--idle)',
                    }}>
                      {entry.author}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg3)' }}>
                      {fmtDate(entry.at)}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--fg2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* timestamps */}
        <div style={{ ...divider, display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 8px' }}>
          {[['created', task.createdAt], ['updated', task.updatedAt]].map(([l, v]) => (
            <React.Fragment key={l}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg3)' }}>{l}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--fg3)' }}>{fmtDate(v)}</span>
            </React.Fragment>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function TasksPage({ params, setParams }) {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [renderedSelectedId, setRenderedSelectedId] = useState(params.task ?? null);
  const [panelOpen, setPanelOpen] = useState(Boolean(params.task));
  const [statusError, setStatusError] = useState(null);

  // Persist filter + selection in URL params
  const activeTag  = params.tag    ?? null;
  const showDone   = params.done   === '1';
  const selectedId = params.task   ?? null;

  const setActiveTag  = (tag)  => setParams({ ...params, tag: tag ?? null });
  const setShowDone   = (fn)   => setParams({ ...params, done: fn(showDone) ? '1' : null });
  const setSelectedId = (id)   => setParams({ ...params, task: id ?? null });

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

  useEffect(() => {
    if (selectedId) {
      setRenderedSelectedId(selectedId);
      const raf = requestAnimationFrame(() => setPanelOpen(true));
      return () => cancelAnimationFrame(raf);
    }

    if (!renderedSelectedId) {
      setPanelOpen(false);
      return;
    }

    setPanelOpen(false);
    const timeout = setTimeout(() => setRenderedSelectedId(null), 180);
    return () => clearTimeout(timeout);
  }, [selectedId, renderedSelectedId]);

  const handleStatusChange = useCallback(async (id, status) => {
    setStatusError(null);
    const previousTask = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    try {
      const response = await fetch(`/api/pi-todo/tasks/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const unresolved = payload?.unresolvedDependencies?.map(dep => `#${dep.id}`).join(', ');
        setStatusError(payload?.error ? `${payload.error}${unresolved ? `: ${unresolved}` : ''}` : 'Status update failed');
        if (previousTask) {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, status: previousTask.status } : t));
        } else {
          fetchTasks();
        }
      }
    } catch {
      fetchTasks();
    }
  }, [fetchTasks, tasks]);

  const handleSelect = useCallback((id) => {
    setParams({ ...params, task: selectedId === id ? null : id });
  }, [params, selectedId, setParams]);

  const handleDependencyChange = useCallback(async (taskId, dependencyId, enabled) => {
    setStatusError(null);
    const previousTask = tasks.find(t => t.id === taskId);
    if (!previousTask) return;

    const nextDependsOnIds = enabled
      ? [...new Set([...(previousTask.dependsOnIds ?? []), dependencyId])]
      : (previousTask.dependsOnIds ?? []).filter(id => id !== dependencyId);

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dependsOnIds: nextDependsOnIds } : t));

    try {
      const response = await fetch(`/api/pi-todo/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependsOnIds: nextDependsOnIds }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setStatusError(payload?.error ?? 'Dependency update failed');
        setTasks(prev => prev.map(t => t.id === taskId ? previousTask : t));
        return;
      }
      const updatedTask = await response.json().catch(() => null);
      if (updatedTask?.id) {
        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === taskId ? previousTask : t));
      setStatusError('Dependency update failed');
    }
  }, [tasks]);

  const allTags = [...new Set(tasks.flatMap(t => t.tags))].sort();
  const visible = activeTag ? tasks.filter(t => t.tags.includes(activeTag)) : tasks;
  const columns = showDone ? COLUMNS : COLUMNS.filter(s => s !== 'done');

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--fg3)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {statusError && (
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid color-mix(in srgb, var(--waiting) 35%, transparent)',
          background: 'color-mix(in srgb, var(--waiting) 10%, transparent)',
          color: 'var(--fg2)',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
        }}>
          {statusError}
        </div>
      )}

      {/* filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        {[null, ...allTags].map(tag => (
          <button key={tag ?? '__all'} onClick={() => setActiveTag(tag === activeTag ? null : tag)} style={{
            fontFamily: 'var(--font-mono)', fontSize: '12px', cursor: 'pointer',
            padding: '3px 10px', borderRadius: 'var(--radius)',
            border:      activeTag === tag ? '1px solid var(--accent)' : '1px solid var(--border)',
            background:  activeTag === tag ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
            color:       activeTag === tag ? 'var(--accent)' : 'var(--fg2)',
          }}>
            {tag ? `#${tag}` : 'all'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowDone(v => !v)} style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px', cursor: 'pointer',
          padding: '3px 10px', borderRadius: 'var(--radius)',
          border:     '1px solid var(--border)',
          background:  showDone ? 'color-mix(in srgb, var(--idle) 12%, transparent)' : 'transparent',
          color:       showDone ? 'var(--idle)' : 'var(--fg3)',
        }}>
          {showDone ? '● hide done' : '● show done'}
        </button>
      </div>

      {/* board + panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>

        {/* board */}
        <div style={{
          flex:                1,
          minWidth:            0,
          display:             'grid',
          gridTemplateColumns: `repeat(${columns.length}, minmax(280px, 1fr))`,
          gridAutoRows:        '1fr',
          gap:                 16,
          padding:             '16px 20px',
          overflowX:           'auto',
          overflowY:           'auto',
          alignItems:          'stretch',
          alignContent:        'start',
        }}>
          {columns.map(status => (
            <Column
              key={status} status={status}
              tasks={visible.filter(t => t.status === status && !t.parentId)}
              allTasks={tasks}
              onStatusChange={handleStatusChange}
              onSelect={handleSelect}
              selectedId={selectedId}
              draggingId={draggingId}
              onDragStart={id => setDraggingId(id)}
              onDragEnd={() => { setDraggingId(null); setDragOverStatus(null); }}
              isDragOver={dragOverStatus === status}
              onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStatus(null); }}
              onDrop={e => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                setDraggingId(null);
                setDragOverStatus(null);
                if (id) handleStatusChange(id, status);
              }}
            />
          ))}
        </div>

        {/* detail panel */}
        {renderedSelectedId && (
          <div style={{
            width:      panelOpen ? 'clamp(320px, 38vw, 760px)' : 0,
            maxWidth:   '100%',
            minWidth:   0,
            overflow:   'hidden',
            flexShrink: 0,
            transition: 'width 180ms ease',
          }}>
            <DetailPanel
              taskId={renderedSelectedId}
              allTasks={tasks}
              onStatusChange={handleStatusChange}
              onDependencyChange={handleDependencyChange}
              onClose={() => setSelectedId(null)}
              isOpen={panelOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
