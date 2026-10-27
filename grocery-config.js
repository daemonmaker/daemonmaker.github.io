/**
 * Public OAuth 2.0 Web client ID (not a secret).
 * Firebase Console → Authentication → Sign-in method → Google → Web SDK
 * configuration → Web client ID.
 *
 * Google Cloud Console → Credentials → same client → Authorized JavaScript
 * origins: https://daemonmaker.github.io and http://localhost.
 * Authorized redirect URIs: https://daemonmaker.github.io/grocery.html and
 * http://localhost:8000/grocery.html (match your local server port).
 */
export const GOOGLE_OAUTH_CLIENT_ID = "75529110090-gaaklg7li6q10novu9s14a5821kvef25.apps.googleusercontent.com";
