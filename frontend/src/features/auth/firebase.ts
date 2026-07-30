/**
 * Google sign-in via Firebase Auth.
 *
 * The Firebase SDK (~160KB) is imported dynamically when the user clicks the
 * Google button, so it stays out of the login page's initial bundle.
 *
 * Persistence is deliberately in-memory: the Firebase session is only a means
 * of obtaining one ID token, which we immediately exchange for a CAST token.
 * Keeping a Firebase session in localStorage would create a second, redundant
 * source of truth for "am I logged in".
 */

export type FederatedProvider = "google.com";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** True when the build was given a Firebase config (drives button rendering). */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

/** Raised when the user closes the popup — not an error worth showing. */
export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SignInCancelled";
  }
}

const CANCELLATION_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

/**
 * Opens the Google popup and returns a freshly minted Firebase ID token.
 * The Firebase session is torn down before returning: the CAST token issued
 * by the backend is the only session that outlives this call.
 */
export async function obtainGoogleIdToken(): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error("Login com Google não está configurado nesta instalação.");
  }

  const [{ initializeApp, getApps }, firebaseAuth] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const {
    getAuth,
    GoogleAuthProvider,
    inMemoryPersistence,
    setPersistence,
    signInWithPopup,
    signOut,
  } = firebaseAuth;

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);

  const provider = new GoogleAuthProvider();
  // Always show the account chooser: without this, a browser signed into a
  // single Google account silently reuses it, which is confusing on a shared
  // machine and makes "sign in as someone else" impossible.
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    const credential = await signInWithPopup(auth, provider);
    try {
      return await credential.user.getIdToken();
    } finally {
      await signOut(auth);
    }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code && CANCELLATION_CODES.has(code)) {
      throw new SignInCancelled();
    }
    throw error;
  }
}
