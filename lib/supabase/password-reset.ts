import { createClient } from "@supabase/supabase-js";
import { getPasswordResetUrl } from "@/lib/auth-redirect";

/**
 * Sends the reset email through a throwaway client using the implicit flow.
 *
 * The app's normal client is PKCE, which only works when the link is opened in
 * the browser that requested it (the verifier lives in a cookie there). Reset
 * emails are often opened elsewhere — e.g. the browser inside a mail app — so
 * the link instead delivers tokens in the URL hash, which
 * /auth/reset-password reads into the normal cookie session.
 */
export function sendPasswordResetEmail(email: string) {
  const client = createClient(
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
  return client.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetUrl(),
  });
}
