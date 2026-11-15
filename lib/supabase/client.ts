import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_ONLY_COOKIE, toSessionCookieOptions } from "@/lib/supabase/session-only";

let browserClient: SupabaseClient | null = null;

export function resetBrowserClient() {
  browserClient = null;
}

function readDocumentCookies(): { name: string; value: string }[] {
  if (typeof document === "undefined" || !document.cookie) return [];
  const seen = new Set<string>();
  const cookies: { name: string; value: string }[] = [];
  for (const pair of document.cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const raw = pair.slice(separator + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Not percent-encoded by us; keep it as-is.
    }
    cookies.push({ name, value });
  }
  return cookies;
}

function writeDocumentCookie(name: string, value: string, options: CookieOptions) {
  if (typeof document === "undefined") return;
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite === true ? "Strict" : options.sameSite}`);
  }
  if (options.secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

export function isSessionOnlyLogin(): boolean {
  return readDocumentCookies().some(({ name }) => name === SESSION_ONLY_COOKIE);
}

/**
 * Call before signing in: the auth cookies written during sign-in follow this.
 * See session-only.ts for how the choice survives token refreshes.
 */
export function setSessionOnlyLogin(sessionOnly: boolean) {
  writeDocumentCookie(SESSION_ONLY_COOKIE, sessionOnly ? "1" : "", {
    path: "/",
    sameSite: "lax",
    secure: window.location.protocol === "https:",
    ...(sessionOnly ? {} : { maxAge: 0 }),
  });
}

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
        },
        cookies: {
          getAll: readDocumentCookies,
          setAll(cookiesToSet) {
            const sessionOnly = isSessionOnlyLogin();
            cookiesToSet.forEach(({ name, value, options }) =>
              writeDocumentCookie(
                name,
                value,
                sessionOnly ? toSessionCookieOptions(options) : options,
              ),
            );
          },
        },
      },
    );
  }
  return browserClient;
}
