import { getConfiguredSiteUrl } from "@/lib/site-url";

/**
 * OAuth callback must use a browser-reachable host.
 * `next dev --hostname 0.0.0.0` still serves on localhost; 0.0.0.0 breaks redirects.
 */
export function getAuthRedirectOrigin() {
  if (typeof window === "undefined") {
    return getConfiguredSiteUrl();
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

/** Server Actions / Route Handlers (no window). */
export function getServerAuthCallbackUrl() {
  return `${getConfiguredSiteUrl()}/auth/callback`;
}
