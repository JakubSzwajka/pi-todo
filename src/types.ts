export type Status = 'open' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type Priority = 1 | 2 | 3;
export type Author = 'kuba' | 'pi';

export interface LogEntry {
  at: string;
  author: Author;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  log: LogEntry[];
}

export interface Store {
  tasks: Task[];
}
