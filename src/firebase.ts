import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  type User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const app = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
for (const scope of GOOGLE_DRIVE_SCOPES) {
  googleProvider.addScope(scope);
}

// In-memory cache ONLY for Google Workspace OAuth access token (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function notifyTokenListeners() {
  tokenListeners.forEach((cb) => cb(cachedDriveAccessToken));
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

export async function googleSignIn(): Promise<{ user: User; accessToken: string | null }> {
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

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
