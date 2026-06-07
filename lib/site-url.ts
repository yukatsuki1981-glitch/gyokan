/** 本番のフォールバック URL（gyokan.app の DNS 障害時も利用可能） */
export const PRODUCTION_SITE_URL = "https://gyokan.vercel.app";

export function getConfiguredSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return PRODUCTION_SITE_URL;
  return "http://localhost:3000";
}
