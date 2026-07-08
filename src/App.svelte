<script lang="ts">
  import { onMount } from 'svelte'
  import { loginWithGoogle, logout, watchAuth, type AuthUser } from './lib/firebase-app'
  import { getDatabaseUrl } from './lib/firebase'

  type Language = 'en' | 'vi'

  const LANGUAGE_STORAGE_KEY = 'mailbox-language'
  const translations = {
    en: {
      authChecking: 'Checking sign-in...',
      chatGroups: 'Message groups',
      chooseGroup: 'Choose a chat group to view messages.',
      copied: 'Copied',
      copy: 'Copy',
      dataListHint: 'This list only loads push ids, from and recipients. It does not load `data` or `transcript`.',
      detailEmpty: 'Click a chat message to view the full content.',
      firebaseAuthBlocked:
        'Firebase Auth is blocking client sign-in. Open Firebase Console > Authentication > Settings > User actions and enable Create (sign-up), then try Google sign-in again.',
      firebaseUnauthorizedDomain:
        'The current domain is not authorized for sign-in. Open Firebase Console > Authentication > Settings > Authorized domains and add this app domain.',
      from: 'From',
      googleSignIn: 'Google sign-in',
      groupCount: 'messages',
      loginDescription:
        'The app uses Firebase Authentication to get an ID token, then sends that token with REST requests to read Realtime Database.',
      loginTitle: 'Sign in to view mailbox',
      logout: 'Logout',
      messageContent: 'Message content',
      messages: 'Messages',
      noGroups: 'No groups found in the database.',
      noMessages: 'This group has no messages.',
      noRecipients: 'No recipients',
      noOtp: 'No OTP found',
      notFound: 'This message was not found.',
      otpCode: 'OTP code',
      peerAddress: 'Peer address',
      receivedAt: 'Received at',
      refresh: 'Refresh',
      signIn: 'Sign in with Google',
      signingIn: 'Signing in...',
      to: 'To',
      unknownPeer: 'Unknown peer',
      unknownSender: 'Unknown sender',
      unknownTime: 'Unknown time',
      loadingGroups: 'Loading groups...',
      loadingMessages: 'Loading messages...',
      loadingMessage: 'Loading content...',
    },
    vi: {
      authChecking: 'Đang kiểm tra đăng nhập...',
      chatGroups: 'Nhóm tin nhắn',
      chooseGroup: 'Chọn một nhóm chat để xem tin.',
      copied: 'Đã copy',
      copy: 'Copy',
      dataListHint: 'Danh sách này chỉ lấy push id, from và recipients. Không tải `data` và `transcript`.',
      detailEmpty: 'Nhấn vào một tin chat để xem toàn bộ nội dung.',
      firebaseAuthBlocked:
        'Firebase Auth đang chặn đăng nhập từ client. Vào Firebase Console > Authentication > Settings > User actions và bật Create (sign-up), sau đó thử đăng nhập Google lại.',
      firebaseUnauthorizedDomain:
        'Domain hiện tại chưa được phép đăng nhập. Vào Firebase Console > Authentication > Settings > Authorized domains và thêm domain đang chạy app.',
      from: 'From',
      googleSignIn: 'Google sign-in',
      groupCount: 'tin',
      loginDescription:
        'App dùng Firebase Authentication để lấy ID token, sau đó token này được gửi vào REST request đọc Realtime Database.',
      loginTitle: 'Đăng nhập để xem mailbox',
      logout: 'Logout',
      messageContent: 'Nội dung tin',
      messages: 'Tin chat',
      noGroups: 'Chưa có nhóm nào trong database.',
      noMessages: 'Nhóm này chưa có tin.',
      noRecipients: 'No recipients',
      noOtp: 'Không tìm thấy OTP',
      notFound: 'Không tìm thấy tin này.',
      otpCode: 'Mã OTP',
      peerAddress: 'Peer address',
      receivedAt: 'Received at',
      refresh: 'Refresh',
      signIn: 'Đăng nhập bằng Google',
      signingIn: 'Đang đăng nhập...',
      to: 'To',
      unknownPeer: 'Unknown peer',
      unknownSender: 'Unknown sender',
      unknownTime: 'Unknown time',
      loadingGroups: 'Đang tải nhóm...',
      loadingMessages: 'Đang tải tin chat...',
      loadingMessage: 'Đang tải nội dung...',
    },
  } satisfies Record<Language, Record<string, string>>

  let language: Language = 'en'
  let InboxComponent: any = null
  let loadingInbox = false
  let user: AuthUser | null = null
  let checkingAuth = true
  let loggingIn = false
  let error = ''
$: t = translations[language]

  onMount(() => {
    const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (storedLanguage === 'en' || storedLanguage === 'vi') {
      language = storedLanguage
    }

    const unwatchAuth = watchAuth((currentUser) => {
      user = currentUser
      checkingAuth = false

      if (currentUser) {
        void loadInboxComponent()
      }
    })

    return unwatchAuth
  })

  function setLanguage(nextLanguage: Language) {
    language = nextLanguage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage)
  }

  async function loadInboxComponent() {
    if (InboxComponent || loadingInbox) return
    loadingInbox = true

    try {
      InboxComponent = (await import('./lib/Inbox.svelte')).default
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      loadingInbox = false
    }
  }

  async function signIn() {
    error = ''
    loggingIn = true

    try {
      await loginWithGoogle()
    } catch (cause) {
      error = getErrorMessage(cause)
    } finally {
      loggingIn = false
    }
  }

  async function signOut() {
    error = ''

    try {
      await logout()
    } catch (cause) {
      error = getErrorMessage(cause)
    }
  }

  function getErrorMessage(cause: unknown) {
    if (typeof cause === 'object' && cause && 'code' in cause) {
      const code = String(cause.code)

      if (code === 'auth/admin-restricted-operation') {
        return t.firebaseAuthBlocked
      }

      if (code === 'auth/unauthorized-domain') {
        return t.firebaseUnauthorizedDomain
      }
    }

    return cause instanceof Error ? cause.message : String(cause)
  }

</script>

<main class="shell">
  <header class="topbar">
    <div class="brand-row">
      <p class="eyebrow">Firebase RTDB Mailbox</p>
      <div class="language-switch mobile-language-switch" aria-label="Language switch">
        <button type="button" class:active={language === 'en'} on:click={() => setLanguage('en')}>EN</button>
        <button type="button" class:active={language === 'vi'} on:click={() => setLanguage('vi')}>VI</button>
      </div>
    </div>
    <div class="topbar-actions">
      <div class="language-switch desktop-language-switch" aria-label="Language switch">
        <button type="button" class:active={language === 'en'} on:click={() => setLanguage('en')}>EN</button>
        <button type="button" class:active={language === 'vi'} on:click={() => setLanguage('vi')}>VI</button>
      </div>
      {#if user}
        <span class="database-url" title={getDatabaseUrl()}>{getDatabaseUrl()}</span>
        <div class="user-chip">
          {#if user.photoURL}
            <img src={user.photoURL} alt="" />
          {/if}
          <span>{user.displayName ?? user.email}</span>
          <button type="button" on:click={signOut}>{t.logout}</button>
        </div>
      {/if}
    </div>
  </header>

  {#if error}
    <section class="alert">{error}</section>
  {/if}

  {#if checkingAuth}
    <section class="login-card">
      <p class="muted">{t.authChecking}</p>
    </section>
  {:else if !user}
    <section class="login-card">
      <p class="eyebrow">{t.googleSignIn}</p>
      <h2>{t.loginTitle}</h2>
      <p class="muted">{t.loginDescription}</p>
      <button type="button" class="google-button" on:click={signIn} disabled={loggingIn}>
        {loggingIn ? t.signingIn : t.signIn}
      </button>
    </section>
  {:else}
    {#if InboxComponent}
      <svelte:component this={InboxComponent} {language} {t} />
    {:else}
      <section class="login-card">
        <p class="muted">{t.loadingGroups}</p>
      </section>
    {/if}
  {/if}
</main>
