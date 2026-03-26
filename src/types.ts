export type Status = 'open' | 'in_progress' | 'review' | 'testing' | 'waiting' | 'done' | 'cancelled';
export type Author = 'kuba' | 'pi';

export interface LogEntry {
  at: string;
  author: Author;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;   // body / PRD content, set once, editable
  parentId?: string;       // loose reference to a parent task id
  tags: string[];          // project / context labels e.g. snapcap, highfive
  status: Status;
  createdAt: string;
  updatedAt: string;
  log: LogEntry[];
}

export interface Store {
  tasks: Task[];
}
