export type DbProject = {
  id: string;
  user_id: string;
  name: string;
  accent_color: string;
  sort_order: number;
};

export type DbTask = {
  id: string;
  user_id: string;
  project_id: string | null;
  case_id: string | null;
  title: string;
  time_label: string;
  task_date: string;
  date_end: string | null;
  done: boolean;
  completed_at: string | null;
  starred: boolean;
  sort_order: number;
};

export type DbCase = {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  status: string;
  status_tone: "blue" | "amber" | "emerald" | "violet";
  deadline: string;
  progress: number;
  goal: string;
  subtasks_done: number;
  subtasks_total: number;
  comments_count: number;
  done: boolean;
  created_at: string;
  completed_at: string | null;
  sort_order: number;
};

export type DbMemo = {
  id: string;
  user_id: string;
  project_id: string;
  memo_date: string;
  body: string;
};

export type DbDailyMemo = {
  id: string;
  user_id: string;
  memo_date: string;
  body: string;
  created_at: string;
};

export type DbDailyDiary = {
  id: string;
  user_id: string;
  diary_date: string;
  body: string;
  created_at: string;
};

export type DbUserPreferences = {
  user_id: string;
  last_view_date: string | null;
};

export type AppTask = {
  id: string;
  title: string;
  time: string;
  date: string;
  dateEnd?: string;
  done: boolean;
  completedAt?: string | null;
  project: string;
  caseId?: string;
  starred?: boolean;
  sortOrder: number;
};

export type AppCase = {
  id: string;
  title: string;
  project: string;
  status: string;
  statusTone: "blue" | "amber" | "emerald" | "violet";
  deadline: string;
  progress: number;
  goal: string;
  subtasksDone: number;
  subtasksTotal: number;
  comments: number;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
  sortOrder: number;
};

export type AppMemo = {
  id: string;
  project: string;
  date: string;
  body: string;
};

export type AppDailyMemo = {
  id: string;
  date: string;
  body: string;
  createdAt: string;
};

export type AppDailyDiary = {
  id: string;
  date: string;
  body: string;
  createdAt: string;
};

export type AppProject = {
  id: string;
  name: string;
  accentColor: string;
  sortOrder: number;
};

export type GyokanData = {
  projects: AppProject[];
  tasks: AppTask[];
  cases: AppCase[];
  memos: AppMemo[];
  dailyMemos: AppDailyMemo[];
  dailyDiaries: AppDailyDiary[];
  lastViewDate: string | null;
};
