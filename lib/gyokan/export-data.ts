import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_VERSION, BUILD_COMMIT_SHORT } from "./build-info";

/**
 * 「データの書き出し」: everything the signed-in person can see, as one JSON
 * file. Read with the app's normal client, so the existing row-level security
 * decides what is included — no special database function.
 *
 * - Tables are read in pages (PAGE_SIZE rows), so large accounts don't hit
 *   the API's row limit or stop half way.
 * - A table the database doesn't have yet (migration not run) is skipped
 *   with a note instead of failing the whole export (schema-compat policy).
 * - Other people's details are left out: family members' events are marked
 *   「メンバー」 without their account id; no e-mail address but my own.
 */

const PAGE_SIZE = 500;

type Row = Record<string, unknown>;

export type ExportDeviceSettings = Record<string, unknown>;

export type ExportAccount = {
  email: string | null;
  loginMethods: string[];
};

type TableSpec = {
  key: string;
  table: string;
  label: string;
  /** Column to page by (stable, unique). */
  orderBy: string;
  /** Only my own rows (user_id = me). Events and their history are not. */
  ownOnly: boolean;
};

const TABLES: TableSpec[] = [
  { key: "projects", table: "projects", label: "プロジェクト", orderBy: "id", ownOnly: true },
  { key: "cases", table: "cases", label: "案件", orderBy: "id", ownOnly: true },
  { key: "tasks", table: "tasks", label: "タスク", orderBy: "id", ownOnly: true },
  { key: "projectMemos", table: "project_memos", label: "プロジェクトのメモ", orderBy: "id", ownOnly: true },
  { key: "dailyMemos", table: "daily_memos", label: "日ごとのメモ", orderBy: "id", ownOnly: true },
  { key: "diaries", table: "daily_diaries", label: "日記", orderBy: "id", ownOnly: true },
  { key: "events", table: "events", label: "予定", orderBy: "id", ownOnly: false },
  { key: "eventHistory", table: "event_history", label: "予定の編集履歴", orderBy: "id", ownOnly: false },
  { key: "preferences", table: "user_preferences", label: "設定(サーバー)", orderBy: "user_id", ownOnly: true },
  { key: "profile", table: "profiles", label: "表示名", orderBy: "user_id", ownOnly: true },
];

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return /does not exist|Could not find the table/i.test(message);
}

async function readAllRows(
  supabase: SupabaseClient,
  spec: TableSpec,
  userId: string,
): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(spec.table).select("*");
    if (spec.ownOnly) query = query.eq("user_id", userId);
    const { data, error } = await query.order(spec.orderBy, { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTableError(error)) return null;
      throw new Error(`${spec.label}を読み込めませんでした(${error.message})`);
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function withoutKeys(row: Row, keys: string[]): Row {
  const copy: Row = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

function addedByLabel(creator: unknown, userId: string): string {
  if (creator == null) return "以前のメンバー";
  return creator === userId ? "自分" : "メンバー";
}

/** 共有 / 自分だけ / (task mode) 対象外 — the same words as the app. */
function sharingLabel(row: Row): string {
  const scope = (row.scope as string | undefined) ?? "private";
  if (scope !== "private") return "対象外(タスク管理モード)";
  return ((row.visibility as string | undefined) ?? "shared") === "only_me" ? "自分だけ" : "共有";
}

function sanitizeEvent(row: Row, userId: string): Row {
  return {
    sharing: sharingLabel(row),
    added_by: addedByLabel(row.user_id, userId),
    ...withoutKeys(row, ["user_id", "household_id"]),
  };
}

function sanitizeHistory(row: Row, userId: string): Row {
  const oldValues =
    row.old_values && typeof row.old_values === "object"
      ? withoutKeys(row.old_values as Row, ["user_id", "household_id"])
      : row.old_values;
  return {
    changed_by: row.changed_by == null ? null : row.changed_by === userId ? "自分" : "メンバー",
    event_added_by: addedByLabel(row.event_user_id, userId),
    ...withoutKeys(row, ["changed_by", "event_user_id", "event_household_id", "old_values"]),
    old_values: oldValues,
  };
}

export type ExportResult = {
  fileName: string;
  json: string;
  counts: Record<string, number>;
};

/** gyokan-export-YYYYMMDD.json (Japan date). */
export function exportFileName(now: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replace(/-/g, "");
  return `gyokan-export-${ymd}.json`;
}

export async function buildExport(
  supabase: SupabaseClient,
  userId: string,
  account: ExportAccount,
  deviceSettings: ExportDeviceSettings,
): Promise<ExportResult> {
  const now = new Date();
  const data: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  const notes: string[] = [];

  // One table at a time: gentle on slow phones and on the API.
  for (const spec of TABLES) {
    const rows = await readAllRows(supabase, spec, userId);
    if (rows === null) {
      notes.push(`${spec.label}: このデータベースには、まだありません`);
      data[spec.key] = [];
      counts[spec.key] = 0;
      continue;
    }
    let cleaned: Row[];
    if (spec.key === "events") cleaned = rows.map((r) => sanitizeEvent(r, userId));
    else if (spec.key === "eventHistory") cleaned = rows.map((r) => sanitizeHistory(r, userId));
    else cleaned = rows.map((r) => withoutKeys(r, ["user_id"]));
    data[spec.key] = cleaned;
    counts[spec.key] = cleaned.length;
  }

  // Key order = order in the file: export date and app version come first.
  const file = {
    exported_at: now.toISOString(),
    app_version: APP_VERSION || null,
    app_commit: BUILD_COMMIT_SHORT || null,
    format: "gyokan-export",
    format_version: 1,
    account: {
      email: account.email,
      login_methods: account.loginMethods,
    },
    about: [
      "行間のデータの書き出しです。あなたが見られるデータが入っています。",
      "予定の sharing は「共有」(ほかのメンバーに見える)/「自分だけ」/「対象外(タスク管理モード)」です。",
      "予定の added_by は、その予定を作った人です(自分/メンバー/以前のメンバー)。ほかのメンバーのメールアドレスやアカウントの番号は入っていません。",
      "日記の写真は、日記の本文の中に入っています。",
    ],
    notes,
    counts,
    device_settings: deviceSettings,
    data,
  };

  return {
    fileName: exportFileName(now),
    json: JSON.stringify(file, null, 2),
    counts,
  };
}

/**
 * Save the file. Must run inside a tap (user gesture) — call it from a
 * button's onClick, not after an await.
 * iPhone / iPad: the share sheet (「"ファイル"に保存」) where available;
 * elsewhere, and as a fallback, a normal download.
 */
export async function saveExportFile(result: ExportResult): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = new Blob([result.json], { type: "application/json" });
  const isAppleTouch =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isAppleTouch && typeof navigator.share === "function" && typeof File === "function") {
    const file = new File([blob], result.fileName, { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return "shared";
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") return "cancelled";
        // Not allowed here: fall back to the download below.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser start reading the file before it goes away.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
