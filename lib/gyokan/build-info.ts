/**
 * Version / build details, fixed at build time by next.config.ts (`env`).
 * Each may be empty (e.g. no commit outside Vercel).
 */
export const APP_VERSION = process.env.GYOKAN_APP_VERSION ?? "";
/** Full commit of the build (Vercel's VERCEL_GIT_COMMIT_SHA); empty locally. */
export const BUILD_COMMIT = process.env.GYOKAN_BUILD_COMMIT ?? "";
/** When the build ran, ISO 8601. */
export const BUILD_TIME = process.env.GYOKAN_BUILD_TIME ?? "";

export const BUILD_COMMIT_SHORT = BUILD_COMMIT.slice(0, 7);

/** "2026/11/24 12:34" in Japan time; "" when unknown. */
export function formatBuildTime(iso: string = BUILD_TIME): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
