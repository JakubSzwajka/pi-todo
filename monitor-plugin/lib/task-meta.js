export const COLUMNS = ['open', 'in_progress', 'review', 'testing', 'waiting', 'done'];

export const STATUS_META = {
  open:        { label: '○ open', color: 'var(--fg2)' },
  in_progress: { label: '◑ in progress', color: 'var(--busy)' },
  review:      { label: '◉ review', color: 'var(--waiting)' },
  testing:     { label: '⬡ testing', color: 'hsl(280,60%,65%)' },
  waiting:     { label: '◌ waiting', color: 'hsl(25,80%,60%)' },
  done:        { label: '● done', color: 'var(--idle)' },
  cancelled:   { label: '✕ cancelled', color: 'var(--fg3)' },
};
