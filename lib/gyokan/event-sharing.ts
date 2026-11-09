import type { EventHistoryEntry } from "./repository";
import type { HouseholdMember } from "./household";

/**
 * What the private-mode event screens need to know about family sharing
 * (households stage 3): who I am, whether anyone shares my calendar, how to
 * name a person, and how to load an event's edit history.
 */
export type EventSharing = {
  myUserId: string | null;
  /** Someone besides me is in my household — only then is 自分だけ/共有 offered. */
  hasFamily: boolean;
  members: HouseholdMember[];
  loadHistory: (eventId: string) => Promise<EventHistoryEntry[]>;
};

function memberName(sharing: EventSharing, userId: string): string | null {
  return sharing.members.find((m) => m.userId === userId)?.displayName?.trim() || null;
}

/** "〇〇さんが追加" for a family member's event (「家族」 while they have no display name); null for mine. */
export function addedByLabel(sharing: EventSharing, creatorId: string | undefined): string | null {
  if (!creatorId || creatorId === sharing.myUserId) return null;
  const name = memberName(sharing, creatorId);
  return name ? `${name}さんが追加` : "家族が追加";
}

/** Who made a change: 「自分」, 「〇〇さん」, or 「家族」. Never an e-mail address. */
export function editorLabel(sharing: EventSharing, userId: string | null): string {
  if (!userId) return "不明";
  if (userId === sharing.myUserId) return "自分";
  const name = memberName(sharing, userId);
  return name ? `${name}さん` : "家族";
}

/** "10/18 22:00" in local time. */
export function formatHistoryTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

const FIELD_LABELS: Record<string, string> = {
  title: "タイトル",
  start_time: "日時",
  end_time: "終了",
  memo: "メモ",
  color: "色",
  visibility: "共有",
  scope: "モード",
};

/** "タイトル・メモ" — the changed columns, in a fixed order, named for the screen. */
export function changedFieldsLabel(fields: string[]): string {
  const order = Object.keys(FIELD_LABELS);
  const known = order.filter((f) => fields.includes(f)).map((f) => FIELD_LABELS[f]);
  const labels = [...new Set(known)];
  if (fields.some((f) => !(f in FIELD_LABELS))) labels.push("その他");
  return labels.join("・") || "内容";
}

export function historyEntryLabel(sharing: EventSharing, entry: EventHistoryEntry): string {
  const who = editorLabel(sharing, entry.changedBy);
  if (entry.action === "delete") return `${who}が削除`;
  return `${who}が${changedFieldsLabel(entry.changedFields)}を変更`;
}
