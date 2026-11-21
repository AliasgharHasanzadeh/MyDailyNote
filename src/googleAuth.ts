import oauthConfig from '../firebase-applet-config.json';

export interface GoogleUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const OAUTH_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || oauthConfig.oAuthClientId;
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_PROFILE_STORAGE_KEY = 'vellum_google_profile_v1';

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisError {
  type?: 'popup_closed' | 'popup_failed_to_open' | 'unknown' | string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (error: GisError) => void;
          }) => GisTokenClient;
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

function loadRememberedProfile(): GoogleUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GOOGLE_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GoogleUser>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.email && !parsed.displayName) return null;
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      email: typeof parsed.email === 'string' ? parsed.email : null,
      photoURL: typeof parsed.photoURL === 'string' ? parsed.photoURL : null,
    };
  } catch {
    return null;
  }
}

function saveRememberedProfile(profile: GoogleUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(GOOGLE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(GOOGLE_PROFILE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

// In-memory cache ONLY for Google Drive OAuth access token (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
let currentGoogleUser: GoogleUser | null = loadRememberedProfile();
let tokenRefreshTimer: number | null = null;
let gisLoadPromise: Promise<void> | null = null;

const tokenListeners = new Set<(token: string | null) => void>();
const userListeners = new Set<(user: GoogleUser | null) => void>();

function notifyTokenListeners() {
  tokenListeners.forEach((cb) => cb(cachedDriveAccessToken));
}

function notifyUserListeners() {
  userListeners.forEach((cb) => cb(currentGoogleUser));
}

function clearTokenRefreshTimer() {
  if (tokenRefreshTimer !== null) {
    window.clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

function scheduleTokenRefresh(expiresInSeconds?: number) {
  clearTokenRefreshTimer();
  if (!expiresInSeconds || expiresInSeconds <= 120) return;
  // Proactively attempt silent token refresh 2 minutes before expiry
  const delayMs = (expiresInSeconds - 120) * 1000;
  tokenRefreshTimer = window.setTimeout(async () => {
    const refreshed = await silentGoogleSignIn();
    if (!refreshed) {
      clearDriveAccessToken();
    }
  }, delayMs);
}

function ensureGisLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In is only available in the browser.'));
  }
  if (window.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`
    );

    const handleReady = () => {
      if (window.google?.accounts?.oauth2?.initTokenClient) {
        resolve();
      } else {
        gisLoadPromise = null;
        reject(new Error('Google Sign-In client failed to initialize.'));
      }
    };

    const handleError = () => {
      gisLoadPromise = null;
      reject(
        new Error(
          'Unable to reach Google Sign-In (accounts.google.com). Please check your connection and try again.'
        )
      );
    };

    if (existing) {
      if (existing.dataset.gisState === 'error') {
        existing.remove();
      } else {
        existing.addEventListener('load', handleReady, { once: true });
        existing.addEventListener('error', handleError, { once: true });
        return;
      }
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.gisState = 'loaded';
      handleReady();
    };
    script.onerror = () => {
      script.dataset.gisState = 'error';
      handleError();
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

async function fetchDriveUserProfile(accessToken: string): Promise<GoogleUser> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) {
      return (
        currentGoogleUser || { displayName: 'Google Drive User', email: null, photoURL: null }
      );
    }
    const json = (await res.json()) as {
      user?: { displayName?: string; emailAddress?: string; photoLink?: string };
    };
    return {
      displayName: json.user?.displayName || json.user?.emailAddress || 'Google Drive User',
      email: json.user?.emailAddress || null,
      photoURL: json.user?.photoLink || null,
    };
  } catch {
    return (
      currentGoogleUser || { displayName: 'Google Drive User', email: null, photoURL: null }
    );
  }
}

export function getCurrentGoogleUser(): GoogleUser | null {
  return currentGoogleUser;
}

export function onGoogleAuthChanged(cb: (user: GoogleUser | null) => void): () => void {
  userListeners.add(cb);
  cb(currentGoogleUser);
  return () => {
    userListeners.delete(cb);
  };
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken() {
  clearTokenRefreshTimer();
  if (cachedDriveAccessToken !== null) {
    cachedDriveAccessToken = null;
    notifyTokenListeners();
  }
}

export function subscribeDriveAccessToken(cb: (token: string | null) => void): () => void {
  tokenListeners.add(cb);
  return () => {
    tokenListeners.delete(cb);
  };
}

let inFlightSilentSignIn: Promise<{ user: GoogleUser; accessToken: string } | null> | null = null;

/**
 * Attempts to silently obtain a fresh Drive access token in the background
 * using the existing Google browser session (never opens a visible popup).
 * Returns null if interactive sign-in is required (e.g. third-party cookies blocked or signed out).
 */
export async function silentGoogleSignIn(): Promise<{
  user: GoogleUser;
  accessToken: string;
} | null> {
  if (!OAUTH_CLIENT_ID || !currentGoogleUser) return null;
  if (cachedDriveAccessToken) {
    return { user: currentGoogleUser, accessToken: cachedDriveAccessToken };
  }
  if (inFlightSilentSignIn) {
    return inFlightSilentSignIn;
  }

  inFlightSilentSignIn = (async () => {
    try {
      await ensureGisLoaded();
    } catch {
      return null;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2?.initTokenClient) return null;

    const hint = currentGoogleUser?.email || undefined;

    const tokenResponse = await new Promise<GisTokenResponse | null>((resolve) => {
      let settled = false;
      const finish = (val: GisTokenResponse | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(val);
      };

      const timer = window.setTimeout(() => finish(null), 6000);

      try {
        const client = oauth2.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: GOOGLE_DRIVE_SCOPES.join(' '),
          hint,
          callback: (response) => {
            if (response.error || !response.access_token) {
              finish(null);
              return;
            }
            finish(response);
          },
          error_callback: () => {
            finish(null);
          },
        });

        client.requestAccessToken({ prompt: 'none', hint });
      } catch {
        finish(null);
      }
    });

    if (!tokenResponse?.access_token) {
      return null;
    }

    const accessToken = tokenResponse.access_token;
    cachedDriveAccessToken = accessToken;
    scheduleTokenRefresh(tokenResponse.expires_in);
    const profile = await fetchDriveUserProfile(accessToken);
    currentGoogleUser = profile;
    saveRememberedProfile(profile);
    notifyUserListeners();
    notifyTokenListeners();

    return { user: profile, accessToken };
  })().finally(() => {
    inFlightSilentSignIn = null;
  });

  return inFlightSilentSignIn;
}

export async function googleSignIn(): Promise<{ user: GoogleUser; accessToken: string | null }> {
  if (!OAUTH_CLIENT_ID) {
    throw new Error('Google OAuth client ID is not configured.');
  }

  await ensureGisLoaded();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error('Google OAuth client is unavailable.');
  }

  const hint = currentGoogleUser?.email || undefined;

  const tokenResponse = await new Promise<GisTokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPES.join(' '),
      hint,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description || `Google authorization failed (${response.error}).`
            )
          );
          return;
        }
        resolve(response);
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') {
          const cancelErr = new Error('Sign-in popup closed.') as Error & { code?: string };
          cancelErr.code = 'auth/popup-closed-by-user';
          reject(cancelErr);
          return;
        }
        if (err.type === 'popup_failed_to_open') {
          reject(
            new Error(
              'Sign-in popup was blocked by your browser. Please allow popups and try again.'
            )
          );
          return;
        }
        reject(new Error('Unable to complete Google sign-in.'));
      },
    });

    client.requestAccessToken({
      prompt: hint ? '' : 'select_account',
      hint,
    });
  });

  const accessToken = tokenResponse.access_token || null;
  if (!accessToken) {
    throw new Error('Google Drive permission was not granted.');
  }

  cachedDriveAccessToken = accessToken;
  scheduleTokenRefresh(tokenResponse.expires_in);
  const profile = await fetchDriveUserProfile(accessToken);
  currentGoogleUser = profile;
  saveRememberedProfile(profile);
  notifyUserListeners();
  notifyTokenListeners();

  return { user: profile, accessToken };
}

export async function googleSignOut(): Promise<void> {
  const token = cachedDriveAccessToken;
  clearDriveAccessToken();
  currentGoogleUser = null;
  saveRememberedProfile(null);
  notifyUserListeners();

  if (token && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      window.google!.accounts!.oauth2!.revoke!(token, () => resolve());
    });
  }
}
