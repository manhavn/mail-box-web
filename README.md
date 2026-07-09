# Mailbox Web

Mailbox Web is a Svelte 5 + TypeScript + Vite web app for reading email messages stored by the Rust `mail-box` SMTP receiver in Firebase Realtime Database.

The app treats each key under `messageGroups` as a message group. Lightweight list data comes from `messageSummaries`, while full email payloads are loaded from `messages` only after selecting one message.

Vietnamese documentation: [README.vi.md](./README.vi.md)

## Features

- Google sign-in with Firebase Authentication.
- Realtime Database list/detail reads use Firebase SDK listeners; database rules are public read so the Rust cleanup task can scan records.
- Message groups are updated in realtime from `messageGroups` metadata.
- Message count is shown for each group.
- Message list is updated in realtime from lightweight `messageSummaries` data.
- Long database URLs and message addresses are available through hover titles.
- Message list avoids loading `data` and `transcript`; full payload is loaded only after selecting one message.
- Full message detail is displayed as text boxes.
- EN/VI language switch with `localStorage` persistence. English is the default language.
- Lazy-loaded inbox chunk so unauthenticated visitors do not download the whole inbox reader.
- Separate Firebase SDK build chunk for better caching.
- Firebase Hosting and Realtime Database rules configuration included.

## Expected Database Shape

The Rust `mail-box` app writes to three Realtime Database areas:

```text
messageGroups/{firebase-path}
messageSummaries/{firebase-path}/{message-id}
messages/{firebase-path}/{message-id}
```

Each `firebase-path` is displayed as a message group. The full payload lives under `messages`, and the list view uses `messageSummaries` so it does not download `data` or `transcript`.

Example full payload under `messages/{firebase-path}/{message-id}`:

```json
{
  "peer_addr": "127.0.0.1:54321",
  "from": "sender@example.com",
  "recipients": ["receiver@example.com"],
  "subject": "test",
  "data": "From: <sender@example.com>\nTo: <receiver@example.com>\nSubject: test\n\nHello\n",
  "transcript": "S: 220 mail-box ready\r\nC: EHLO localhost\r\n...",
  "received_at": "2026-07-08T12:00:00Z"
}
```

Example summary under `messageSummaries/{firebase-path}/{message-id}`:

```json
{
  "from": "sender@example.com",
  "recipients": ["receiver@example.com"],
  "subject": "test",
  "received_at": "2026-07-08T12:00:00Z"
}
```

Example group metadata under `messageGroups/{firebase-path}`:

```json
{
  "count": 12,
  "last_message_id": "-OExamplePushId",
  "updated_at": "2026-07-08T12:00:00Z"
}
```

## Firebase Setup From A New Project

### 1. Create A Firebase Project

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. Add a Web app to the project.
4. Copy the Firebase Web SDK config values.

The app needs these values:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PROJECT_ID-default-rtdb.REGION.firebasedatabase.app",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
  measurementId: "..."
}
```

### 2. Enable Google Sign-In

1. Go to `Authentication > Sign-in method`.
2. Enable `Google`.
3. Go to `Authentication > Settings > Authorized domains`.
4. Add your Firebase Hosting domain, for example `PROJECT_ID.web.app`.
5. If sign-in returns `auth/admin-restricted-operation`, open `Authentication > Settings > User actions` and allow client sign-up/user creation.

### 3. Create Realtime Database

1. Go to `Realtime Database`.
2. Create a database.
3. Pick the region you want to use.
4. Copy the database URL. It must match `VITE_FIREBASE_DATABASE_URL`.

This project includes `database.rules.json`:

```json
{
    "rules": {
    ".read": "auth != null",
    "messageCleanup": {
      ".read": true
    },
    ".write": true
  }
}
```

Main database reads require a signed-in Firebase user. `messageCleanup` is public-read because it only stores cleanup timestamps and lets the Rust cleanup task scan expired records without reading message content. `write` is public so the Rust SMTP receiver can keep posting messages by URL. If you lock writes down, make sure the Rust process has a valid Firebase Auth token or another server-side access strategy.

### 4. Set Up Firebase Hosting

This repository already contains `firebase.json` configured for Vite output:

```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "database": {
    "rules": "database.rules.json"
  }
}
```

If you are starting from scratch, run:

```sh
firebase init hosting database
```

Use `dist` as the public directory, and keep `database.rules.json` as the database rules file.

## Environment Variables

Copy the example file:

```sh
cp .env.example .env
```

Fill in `.env`:

```env
VITE_FIREBASE_DATABASE_URL=https://PROJECT_ID-default-rtdb.REGION.firebasedatabase.app
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=PROJECT_ID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=PROJECT_ID.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=YOUR_MEASUREMENT_ID
```

`.env` is ignored by Git. Commit `.env.example`, not `.env`.

## Install And Run Locally

Install dependencies:

```sh
npm install
```

Run the dev server:

```sh
npm run dev
```

Open the local URL printed by Vite, then sign in with Google.

## Build, Check, And Lint

Type-check Svelte and TypeScript:

```sh
npm run check
```

Run the manual lint script:

```sh
npm run lint:manual
```

Build for production:

```sh
npm run build
```

The production output is written to `dist`.

## Deploy

Deploy Realtime Database rules:

```sh
npm run deploy:database
```

Build and deploy Firebase Hosting:

```sh
npm run deploy:hosting
```

The hosting deploy script runs `npm run build` first.

## Connecting The Rust SMTP Receiver

Run the Rust `mail-box` receiver with Firebase enabled:

```sh
./target/release/mail-box \
  --firebase-url https://PROJECT_ID-default-rtdb.REGION.firebasedatabase.app \
  --firebase-path support
```

Each `--firebase-path` value appears in this web app as one message group.

## Useful Scripts

- `npm run dev`: start the Vite dev server.
- `npm run build`: build the production app.
- `npm run preview`: preview the production build locally.
- `npm run check`: run `svelte-check` and TypeScript checks.
- `npm run lint:manual`: run `oxlint` and type checks.
- `npm run deploy:database`: deploy Realtime Database rules.
- `npm run deploy:hosting`: build and deploy Firebase Hosting.

## Notes

- Firebase Web config values are public client configuration, but keep `.env` local so deployments and environments are explicit.
- Realtime Database security is controlled by `database.rules.json`, not by hiding the database URL.
- If Google sign-in works locally but fails on hosting, check Firebase Auth authorized domains.
- If database reads fail after sign-in, deploy the latest database rules and verify the database URL in `.env`.
