import { getAuthToken } from './firebase-app'
import {
  endBefore,
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByKey,
  orderByChild,
  push,
  query,
  ref,
  remove,
  set,
  startAt,
  endAt,
  type Unsubscribe,
} from 'firebase/database'
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

export type RandomEmail = {
  id: string
  email: string
  domain: string
  created_at: string
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

function getRecordTime(value: string | undefined, id: string) {
  const parsedTime = value ? Date.parse(value) : Number.NaN
  if (Number.isFinite(parsedTime)) return parsedTime
  return decodePushIdTime(id)?.getTime() ?? 0
}

function compareByTimeDesc(a: { id: string }, b: { id: string }, getTimeValue: (item: { id: string }) => string | undefined) {
  const timeDelta = getRecordTime(getTimeValue(b), b.id) - getRecordTime(getTimeValue(a), a.id)
  return timeDelta || b.id.localeCompare(a.id)
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
      .sort((a, b) => compareByTimeDesc(a, b, (message) => (message as MessageSummary).received_at))

    callback(messages)
  })
}

export function watchRandomDomains(userId: string, callback: (domains: string[]) => void): Unsubscribe {
  return onValue(ref(database, `settings/${userId}/domains`), (snapshot) => {
    const value = snapshot.val() as unknown
    callback(Array.isArray(value) ? value.filter((domain) => typeof domain === 'string') : [])
  })
}

export function watchEmailPrefix(userId: string, callback: (prefix: string) => void): Unsubscribe {
  return onValue(ref(database, `settings/${userId}/emailPrefix`), (snapshot) => {
    const value = snapshot.val() as unknown
    callback(typeof value === 'string' ? value : '')
  })
}

export async function saveRandomDomains(userId: string, domains: string[]) {
  await set(ref(database, `settings/${userId}/domains`), domains)
}

export async function saveEmailPrefix(userId: string, prefix: string) {
  await set(ref(database, `settings/${userId}/emailPrefix`), prefix)
}

export async function listRandomEmails(userId: string, pageSize: number, beforeKey?: string) {
  const emailRef = ref(database, `userData/${userId}/randomEmails`)
  const emailQuery = beforeKey
    ? query(emailRef, orderByKey(), endBefore(beforeKey), limitToLast(pageSize))
    : query(emailRef, orderByKey(), limitToLast(pageSize))
  const snapshot = await get(emailQuery)
  const value = snapshot.val() as Record<string, Omit<RandomEmail, 'id'>> | null

  return Object.entries(value ?? {})
    .map(([id, email]) => ({ id, ...email }))
    .sort((a, b) => compareByTimeDesc(a, b, (email) => (email as RandomEmail).created_at))
}

export function watchRandomEmails(userId: string, pageSize: number, callback: (emails: RandomEmail[]) => void): Unsubscribe {
  const emailRef = ref(database, `userData/${userId}/randomEmails`)
  const emailQuery = query(emailRef, orderByKey(), limitToLast(pageSize))

  return onValue(emailQuery, (snapshot) => {
    const value = snapshot.val() as Record<string, Omit<RandomEmail, 'id'>> | null
    callback(
      Object.entries(value ?? {})
        .map(([id, email]) => ({ id, ...email }))
        .sort((a, b) => compareByTimeDesc(a, b, (email) => (email as RandomEmail).created_at)),
    )
  })
}

export async function searchRandomEmails(userId: string, searchTerm: string, pageSize: number) {
  const emailRef = ref(database, `userData/${userId}/randomEmails`)
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const emailQuery = query(
    emailRef,
    orderByChild('email'),
    startAt(normalizedSearchTerm),
    endAt(`${normalizedSearchTerm}\uf8ff`),
    limitToLast(pageSize),
  )
  const snapshot = await get(emailQuery)
  const value = snapshot.val() as Record<string, Omit<RandomEmail, 'id'>> | null

  return Object.entries(value ?? {})
    .map(([id, email]) => ({ id, ...email }))
    .sort((a, b) => compareByTimeDesc(a, b, (email) => (email as RandomEmail).created_at))
}

export function watchSearchRandomEmails(
  userId: string,
  searchTerm: string,
  pageSize: number,
  callback: (emails: RandomEmail[]) => void,
): Unsubscribe {
  const emailRef = ref(database, `userData/${userId}/randomEmails`)
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const emailQuery = query(
    emailRef,
    orderByChild('email'),
    startAt(normalizedSearchTerm),
    endAt(`${normalizedSearchTerm}\uf8ff`),
    limitToLast(pageSize),
  )

  return onValue(emailQuery, (snapshot) => {
    const value = snapshot.val() as Record<string, Omit<RandomEmail, 'id'>> | null
    callback(
      Object.entries(value ?? {})
        .map(([id, email]) => ({ id, ...email }))
        .sort((a, b) => compareByTimeDesc(a, b, (email) => (email as RandomEmail).created_at)),
    )
  })
}

export async function createRandomEmail(userId: string, email: string, domain: string) {
  const emailRef = push(ref(database, `userData/${userId}/randomEmails`))
  const randomEmail: Omit<RandomEmail, 'id'> = {
    email,
    domain,
    created_at: new Date().toISOString(),
  }

  await set(emailRef, randomEmail)
  return { id: emailRef.key ?? '', ...randomEmail }
}

export async function deleteRandomEmail(userId: string, emailId: string) {
  await remove(ref(database, `userData/${userId}/randomEmails/${emailId}`))
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
