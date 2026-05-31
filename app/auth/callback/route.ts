import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

function getSafeOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  const { hostname, port, protocol } = url;

  if (hostname === "0.0.0.0" || hostname === "[::]") {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (configured) return configured;
    return `${protocol}//localhost${port ? `:${port}` : ""}`;
  }

  return url.origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getSafeOrigin(request);
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const oauthError = searchParams.get("error");
  const oauthDescription = searchParams.get("error_description");
  if (oauthError) {
    console.error("[auth/callback] OAuth error:", oauthError, oauthDescription);
    const reason = oauthDescription?.includes("exchange")
      ? "google_exchange"
      : "oauth";
    return NextResponse.redirect(`${origin}/login?error=auth&reason=${reason}`);
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth&reason=no_code`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] session exchange failed:", error.message);
    const detail = encodeURIComponent(error.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth&reason=session&detail=${detail}`,
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
