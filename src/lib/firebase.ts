import { getAuthToken } from './firebase-app'
import { getDatabase, get, onValue, ref, type Unsubscribe } from 'firebase/database'
import { app } from './firebase-app'
import { getDatabaseUrl } from './firebase-config'

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'

export type EmailMessage = {
  id: string
  peer_addr?: string
  from?: string
  recipients?: string[]
  subject?: string
  data?: string
  transcript?: string
  received_at?: string
  [key: string]: unknown
}

export type MessageGroup = {
  id: string
  count: number
  last_message_id?: string
  updated_at?: string
}

export type MessageSummary = {
  id: string
  from?: string
  recipients?: string[]
  subject?: string
  received_at?: string
}

const database = getDatabase(app)

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
  const groups = await request<Record<string, true> | null>('messageGroups', { shallow: 'true' })
  return Object.keys(groups ?? {}).sort((a, b) => a.localeCompare(b))
}

export async function listMessageIds(group: string) {
  const messages = await request<Record<string, true> | null>(`messageSummaries/${group}`, {
    shallow: 'true',
  })
  return Object.keys(messages ?? {}).sort((a, b) => b.localeCompare(a))
}

export async function getMessage(group: string, id: string): Promise<EmailMessage | null> {
  const snapshot = await get(ref(database, `messages/${group}/${id}`))
  const message = snapshot.val() as Omit<EmailMessage, 'id'> | null
  return message ? { id, ...message } : null
}

export async function getMessageRecipients(group: string, id: string) {
  return request<string[] | null>(`messageSummaries/${group}/${id}/recipients`)
}

export async function getMessageFrom(group: string, id: string) {
  return request<string | null>(`messageSummaries/${group}/${id}/from`)
}

export function watchGroups(callback: (groups: MessageGroup[]) => void): Unsubscribe {
  return onValue(ref(database, 'messageGroups'), (snapshot) => {
    const value = snapshot.val() as Record<string, Omit<MessageGroup, 'id'>> | null
    const groups = Object.entries(value ?? {})
      .map(([id, group]) => ({
        id,
        count: Number(group?.count ?? 0),
        last_message_id: group?.last_message_id,
        updated_at: group?.updated_at,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))

    callback(groups)
  })
}

export function watchMessageSummaries(
  group: string,
  callback: (messages: MessageSummary[]) => void,
): Unsubscribe {
  return onValue(ref(database, `messageSummaries/${group}`), (snapshot) => {
    const value = snapshot.val() as Record<string, Omit<MessageSummary, 'id'>> | null
    const messages = Object.entries(value ?? {})
      .map(([id, message]) => ({
        id,
        from: message?.from,
        recipients: message?.recipients,
        subject: message?.subject,
        received_at: message?.received_at,
      }))
      .sort((a, b) => b.id.localeCompare(a.id))

    callback(messages)
  })
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
