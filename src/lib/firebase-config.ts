const databaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined

export function getDatabaseUrl() {
  return databaseUrl?.trim().replace(/\/+$/, '') ?? ''
}
