import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
}

const app = initializeApp(firebaseConfig)
const provider = new GoogleAuthProvider()

export const auth = getAuth(app)
export { app }

export type AuthUser = User

export function watchAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export async function loginWithGoogle() {
  await signInWithPopup(auth, provider)
}

export async function logout() {
  await signOut(auth)
}

export async function getAuthToken() {
  return auth.currentUser?.getIdToken() ?? null
}
