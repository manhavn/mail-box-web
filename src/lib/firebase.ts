import { getAuthToken } from './firebase-app'

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'

export type EmailMessage = {
  id: string
  peer_addr?: string
  from?: string
  recipients?: string[]
  data?: string
  transcript?: string
  received_at?: string
  [key: string]: unknown
}

const databaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined

export function getDatabaseUrl() {
  return databaseUrl?.trim().replace(/\/+$/, '') ?? ''
}

export function decodePushIdTime(id: string) {
  if (id.length < 8) return null

  let timestamp = 0
  for (const character of id.slice(0, 8)) {
    const index = PUSH_CHARS.indexOf(character)
    if (index < 0) return null
    timestamp = timestamp * 64 + index
  }

  return new Date(timestamp)
}

export async function listGroups() {
  const groups = await request<Record<string, true> | null>('', { shallow: 'true' })
  return Object.keys(groups ?? {}).sort((a, b) => a.localeCompare(b))
}

export async function listMessageIds(group: string) {
  const messages = await request<Record<string, true> | null>(group, { shallow: 'true' })
  return Object.keys(messages ?? {}).sort((a, b) => b.localeCompare(a))
}

export async function getMessage(group: string, id: string): Promise<EmailMessage | null> {
  const message = await request<Omit<EmailMessage, 'id'> | null>(`${group}/${id}`)
  return message ? { id, ...message } : null
}

export async function getMessageRecipients(group: string, id: string) {
  return request<string[] | null>(`${group}/${id}/recipients`)
}

export async function getMessageFrom(group: string, id: string) {
  return request<string | null>(`${group}/${id}/from`)
}

async function request<T>(path: string, params: Record<string, string> = {}) {
  const baseUrl = getDatabaseUrl()
  if (!baseUrl) {
    throw new Error('Missing VITE_FIREBASE_DATABASE_URL in .env')
  }

  const url = new URL(`${baseUrl}/${path.split('/').map(encodeURIComponent).join('/')}.json`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  const authToken = await getAuthToken()
  if (authToken) {
    url.searchParams.set('auth', authToken)
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Firebase returned ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}
