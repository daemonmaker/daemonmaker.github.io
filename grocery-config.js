/**
 * Public OAuth 2.0 Web client ID (not a secret).
 * Firebase Console → Authentication → Sign-in method → Google → Web SDK
 * configuration → Web client ID.
 *
 * Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
 * → open the Web client whose ID matches GOOGLE_OAUTH_CLIENT_ID below (not a
 * different client in the list).
 *
 * Authorized JavaScript origins (no path):
 *   https://daemonmaker.github.io
 *   http://localhost
 *
 * Authorized redirect URIs (must match GOOGLE_OAUTH_REDIRECT_URI exactly):
 *   https://daemonmaker.github.io/
 *   http://localhost:8000/
 */
export const GOOGLE_OAUTH_CLIENT_ID =
  "75529110090-gaaklg7li6q10novu9s14a5821kvef25.apps.googleusercontent.com";

/** Must appear verbatim in Google Cloud → Authorized redirect URIs. */
export const GOOGLE_OAUTH_REDIRECT_URI = "https://daemonmaker.github.io/";
