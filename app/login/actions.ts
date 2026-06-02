"use server";

import { getServerAuthCallbackUrl } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getServerAuthCallbackUrl() },
  });

  if (error) {
    redirect(
      `/login?error=auth&reason=oauth&detail=${encodeURIComponent(error.message)}`,
    );
  }

  if (data.url) {
    redirect(data.url);
  }

  redirect("/login?error=auth&reason=no_url");
}
