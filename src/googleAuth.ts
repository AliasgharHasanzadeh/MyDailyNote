import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  type User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

export type GoogleUser = User;

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  googleProvider.addScope(scope);
}

// In-memory cache ONLY for Google Drive OAuth access token (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function notifyTokenListeners() {
  tokenListeners.forEach((cb) => cb(cachedDriveAccessToken));
}

export function getCurrentGoogleUser(): GoogleUser | null {
  return auth.currentUser;
}

export function onGoogleAuthChanged(cb: (user: GoogleUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken() {
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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearDriveAccessToken();
  }
});

export async function googleSignIn(): Promise<{ user: GoogleUser; accessToken: string | null }> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  cachedDriveAccessToken = credential?.accessToken || null;
  notifyTokenListeners();
  return { user: result.user, accessToken: cachedDriveAccessToken };
}

export async function googleSignOut(): Promise<void> {
  await signOut(auth);
  clearDriveAccessToken();
}
