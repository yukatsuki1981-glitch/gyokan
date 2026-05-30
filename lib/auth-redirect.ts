/**
 * OAuth callback must use a browser-reachable host.
 * `next dev --hostname 0.0.0.0` still serves on localhost; 0.0.0.0 breaks redirects.
 */
export function getAuthRedirectOrigin() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  }

  const { hostname, port, protocol } = window.location;
  if (hostname === "0.0.0.0" || hostname === "[::]" || hostname === "::1") {
    return `${protocol}//localhost${port ? `:${port}` : ""}`;
  }

  // PKCE cookies are scoped to the current host — must match the OAuth callback URL.
  return window.location.origin;
}

export function getAuthCallbackUrl() {
  return `${getAuthRedirectOrigin()}/auth/callback`;
}
