const KEY = "gyokan_story_v1";

interface StoryState {
  lastShownAt: string | null;
  completedSinceLast: number;
  pendingText: string | null;
}

function read(): StoryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoryState;
  } catch {}
  return { lastShownAt: null, completedSinceLast: 0, pendingText: null };
}

function write(s: StoryState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function recordTaskCompleted(): number {
  const s = read();
  const next = s.completedSinceLast + 1;
  write({ ...s, completedSinceLast: next });
  return next;
}

export function storePendingText(text: string) {
  const s = read();
  write({ ...s, pendingText: text });
}

export function recordShown() {
  write({
    lastShownAt: new Date().toISOString(),
    completedSinceLast: 0,
    pendingText: null,
  });
}

// 保存済みのテキストを21時以降なら返す
export function getDisplayableText(): string | null {
  const s = read();
  if (!s.pendingText) return null;
  if (new Date().getHours() < 21) return null;
  return s.pendingText;
}

// 3日経過かつ pending がない場合に生成が必要
export function shouldGenerateOnOpen(): boolean {
  const s = read();
  if (s.pendingText) return false;
  if (!s.lastShownAt) return false;
  const diffDays = (Date.now() - new Date(s.lastShownAt).getTime()) / 86400000;
  return diffDays >= 3;
}
