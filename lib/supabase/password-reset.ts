import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPasswordResetUrl } from "@/lib/auth-redirect";

let resetClient: SupabaseClient | null = null;

/**
 * Sends the reset email through a separate, session-less client using the implicit flow.
 *
 * The app's normal client is PKCE, which only works when the link is opened in
 * the browser that requested it (the verifier lives in a cookie there). Reset
 * emails are often opened elsewhere — e.g. the browser inside a mail app — so
 * the link instead delivers tokens in the URL hash, which
 * /auth/reset-password reads into the normal cookie session.
 */
export function sendPasswordResetEmail(email: string) {
  resetClient ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "gyokan-password-reset",
      },
    },
  );
  return resetClient.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetUrl(),
  });
}
