/**
 * Public OAuth web client ID from Firebase Console → Authentication →
 * Google → Web SDK configuration.
 *
 * Google Cloud → Credentials → that same Web client → Authorized redirect URIs
 * must include GOOGLE_OAUTH_REDIRECT_URI exactly (no trailing slash):
 *   https://daemonmaker.github.io/grocery.html
 */
export const GOOGLE_OAUTH_CLIENT_ID =
  "75529110090-gaaklg7li6q10novu9s14a5821kvef25.apps.googleusercontent.com";

export const GOOGLE_OAUTH_REDIRECT_URI =
  "https://daemonmaker.github.io/grocery.html";
