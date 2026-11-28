import type { EventHistoryEntry } from "./repository";
import { FORMER_MEMBER_LABEL, UNNAMED_MEMBER_LABEL, type HouseholdMember } from "./household";

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
  /**
   * The member list has been loaded. Until then nobody can be told apart
   * from a former member, so unknown people are shown as 「メンバー」.
   */
  membersLoaded: boolean;
  loadHistory: (eventId: string) => Promise<EventHistoryEntry[]>;
};

/**
 * How to call another person: 「〇〇さん」, 「メンバー」 (a member without a
 * display name), or 「以前のメンバー」 (not in my household any more).
 */
function personLabel(sharing: EventSharing, userId: string): string {
  const member = sharing.members.find((m) => m.userId === userId);
  if (!member) return sharing.membersLoaded ? FORMER_MEMBER_LABEL : UNNAMED_MEMBER_LABEL;
  const name = member.displayName?.trim();
  return name ? `${name}さん` : UNNAMED_MEMBER_LABEL;
}

/**
 * "〇〇さんが追加" for someone else's event (「メンバー」/「以前のメンバー」 as above);
 * 「以前のメンバーが追加」 when the creator has left (creatorId null); null for mine.
 */
export function addedByLabel(sharing: EventSharing, creatorId: string | null | undefined): string | null {
  if (creatorId === null) return `${FORMER_MEMBER_LABEL}が追加`;
  if (!creatorId || creatorId === sharing.myUserId) return null;
  return `${personLabel(sharing, creatorId)}が追加`;
}

/**
 * Who made a change: 「自分」, 「〇〇さん」, 「メンバー」 or 「以前のメンバー」. Never an e-mail address.
 * No one recorded (changed_by empty): the person deleted their account
 * (delete_my_account empties it), so 「以前のメンバー」 as well.
 */
export function editorLabel(sharing: EventSharing, userId: string | null): string {
  if (!userId) return FORMER_MEMBER_LABEL;
  if (userId === sharing.myUserId) return "自分";
  return personLabel(sharing, userId);
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
