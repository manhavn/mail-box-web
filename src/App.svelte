<script lang="ts">
  import { onMount } from 'svelte'
  import { loginWithGoogle, logout, watchAuth, type AuthUser } from './lib/firebase-app'
  import { getDatabaseUrl } from './lib/firebase-config'

  type Language = 'en' | 'vi'

  const LANGUAGE_STORAGE_KEY = 'mailbox-language'
  const translations = {
    en: {
      authChecking: 'Checking sign-in...',
      cancel: 'Cancel',
      cancelAddEmail: 'Cancel add',
      chatGroups: 'Message groups',
      chooseGroup: 'Choose a chat group to view messages.',
      copied: 'Copied',
      copy: 'Copy',
      close: 'Close',
      collapse: 'Collapse',
      addDomain: 'Add domain',
      addEmail: 'Add email',
      addEmailPlaceholder: 'Enter email to save',
      copyEmail: 'Copy email',
      creatingEmail: 'Creating email...',
      data: 'Data',
      dataListHint: 'This list only loads push ids, from and recipients. It does not load `data` or `transcript`.',
      detailEmpty: 'Click a chat message to view the full content.',
      delete: 'Delete',
      deleteRandomDomainMessage: 'This domain will be removed:',
      deleteRandomDomainTitle: 'Delete random domain?',
      deleteRandomEmailMessage: 'This email will be removed:',
      deleteRandomEmailTitle: 'Delete random email?',
      downloadHtml: 'Download HTML',
      emailPrefix: 'Email prefix',
      emailPrefixPlaceholder: 'Optional prefix, leave empty for fully random',
      editLabel: 'Edit label',
      expand: 'Expand',
      firebaseAuthBlocked:
        'Firebase Auth is blocking client sign-in. Open Firebase Console > Authentication > Settings > User actions and enable Create (sign-up), then try Google sign-in again.',
      firebaseUnauthorizedDomain:
        'The current domain is not authorized for sign-in. Open Firebase Console > Authentication > Settings > Authorized domains and add this app domain.',
      from: 'From',
      googleSignIn: 'Google sign-in',
      groupCount: 'messages',
      getRandomEmail: 'Get random email',
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
      noRandomEmails: 'No random emails yet.',
      randomEmailLabelPlaceholder: 'Label for this email',
      noRenderedContent: 'No rendered content found in this message.',
      notFound: 'This message was not found.',
      otpCode: 'OTP code',
      parsingMime: 'Parsing MIME message...',
      peerAddress: 'Peer address',
      receivedAt: 'Received at',
      renderedEmail: 'Rendered email',
      renderedEmailFullScreen: 'Rendered email full screen',
      renderParseFailed: 'Could not parse MIME message',
      randomDomain: 'Random domains',
      randomDomainMxExample: 'Use these values for your domains and subdomains',
      randomDomainMxIntro: 'For each domain in this list, add these MX records in DNS so inbound email can be routed.',
      randomDomainMxMissing: 'No MX records configured in VITE_RANDOM_EMAIL_MX_RECORDS.',
      randomDomainMxTip: 'MX setup help',
      randomDomainMxFormat: 'Env format: comma-separated mail servers. The app generates Host=@, Priority=10/20/30..., TTL=3600.',
      randomDomainMxRootHelp: 'Use Host=@ for the root domain, for example example.com.',
      randomDomainMxSubdomainHelp: 'For subdomains, use Host=mail or the full host mail.example.com, depending on your DNS provider.',
      randomDomainMxSubdomainRecordHelp: 'The records above use Host=@. For a subdomain, copy a record and replace Host=@ with your subdomain, for example Host=mail or Host=mail.example.com.',
      randomDomainPlaceholder: 'Enter a domain and press Enter',
      randomEmails: 'Random emails',
      refresh: 'Refresh',
      save: 'Save',
      saving: 'Saving...',
      searchEmail: 'Search email',
      settings: 'Settings',
      sourceCodeServer: 'Source code server',
      sourceCodeUi: 'Source code UI',
      signIn: 'Sign in with Google',
      signingIn: 'Signing in...',
      subject: 'Subject',
      to: 'To',
      unknownPeer: 'Unknown peer',
      unknownSender: 'Unknown sender',
      unknownTime: 'Unknown time',
      loadingGroups: 'Loading groups...',
      loadingMessages: 'Loading messages...',
      loadingMessage: 'Loading content...',
      transcript: 'Transcript',
    },
    vi: {
      authChecking: 'Đang kiểm tra đăng nhập...',
      cancel: 'Hủy',
      cancelAddEmail: 'Hủy thêm',
      chatGroups: 'Nhóm tin nhắn',
      chooseGroup: 'Chọn một nhóm chat để xem tin.',
      copied: 'Đã copy',
      copy: 'Copy',
      close: 'Đóng',
      collapse: 'Thu gọn',
      addDomain: 'Thêm domain',
      addEmail: 'Thêm email',
      addEmailPlaceholder: 'Nhập email cần lưu',
      copyEmail: 'Copy email',
      creatingEmail: 'Đang tạo email...',
      data: 'Dữ liệu',
      dataListHint: 'Danh sách này chỉ lấy push id, from và recipients. Không tải `data` và `transcript`.',
      detailEmpty: 'Nhấn vào một tin chat để xem toàn bộ nội dung.',
      delete: 'Xóa',
      deleteRandomDomainMessage: 'Domain này sẽ bị xóa:',
      deleteRandomDomainTitle: 'Xóa random domain?',
      deleteRandomEmailMessage: 'Email này sẽ bị xóa:',
      deleteRandomEmailTitle: 'Xóa random email?',
      downloadHtml: 'Tải HTML',
      emailPrefix: 'Email prefix',
      emailPrefixPlaceholder: 'Prefix tùy chọn, bỏ trống để random hoàn toàn',
      editLabel: 'Sửa nhãn',
      expand: 'Mở rộng',
      firebaseAuthBlocked:
        'Firebase Auth đang chặn đăng nhập từ client. Vào Firebase Console > Authentication > Settings > User actions và bật Create (sign-up), sau đó thử đăng nhập Google lại.',
      firebaseUnauthorizedDomain:
        'Domain hiện tại chưa được phép đăng nhập. Vào Firebase Console > Authentication > Settings > Authorized domains và thêm domain đang chạy app.',
      from: 'From',
      googleSignIn: 'Đăng nhập Google',
      groupCount: 'tin',
      getRandomEmail: 'Tạo random email',
      loginDescription:
        'App dùng Firebase Authentication để lấy ID token, sau đó token này được gửi vào REST request đọc Realtime Database.',
      loginTitle: 'Đăng nhập để xem mailbox',
      logout: 'Đăng xuất',
      messageContent: 'Nội dung tin',
      messages: 'Tin chat',
      noGroups: 'Chưa có nhóm nào trong database.',
      noMessages: 'Nhóm này chưa có tin.',
      noRecipients: 'Không có người nhận',
      noOtp: 'Không tìm thấy OTP',
      noRandomEmails: 'Chưa có random email nào.',
      randomEmailLabelPlaceholder: 'Nhãn cho email này',
      noRenderedContent: 'Không tìm thấy nội dung render trong tin này.',
      notFound: 'Không tìm thấy tin này.',
      otpCode: 'Mã OTP',
      parsingMime: 'Đang parse MIME message...',
      peerAddress: 'Địa chỉ peer',
      receivedAt: 'Thời gian nhận',
      renderedEmail: 'Email đã render',
      renderedEmailFullScreen: 'Xem toàn màn hình',
      renderParseFailed: 'Không thể parse MIME message',
      randomDomain: 'Random domains',
      randomDomainMxExample: 'Dùng các tham số này cho domain và subdomain của bạn',
      randomDomainMxIntro: 'Với mỗi domain trong danh sách này, thêm các MX record sau trong DNS để email đến được route đúng.',
      randomDomainMxMissing: 'Chưa cấu hình MX trong VITE_RANDOM_EMAIL_MX_RECORDS.',
      randomDomainMxTip: 'Hướng dẫn cấu hình MX',
      randomDomainMxFormat: 'Định dạng env: danh sách mail server phân tách bằng dấu phẩy. App tự tạo Host=@, Priority=10/20/30..., TTL=3600.',
      randomDomainMxRootHelp: 'Dùng Host=@ cho root domain, ví dụ example.com.',
      randomDomainMxSubdomainHelp: 'Với subdomain, dùng Host=mail hoặc host đầy đủ mail.example.com tùy DNS provider.',
      randomDomainMxSubdomainRecordHelp: 'Các record trên đang dùng Host=@. Nếu setup subdomain, copy một record rồi đổi Host=@ thành subdomain của bạn, ví dụ Host=mail hoặc Host=mail.example.com.',
      randomDomainPlaceholder: 'Nhập domain rồi nhấn Enter',
      randomEmails: 'Random email',
      refresh: 'Làm mới',
      save: 'Lưu',
      saving: 'Đang lưu...',
      searchEmail: 'Tìm email',
      settings: 'Cài đặt',
      sourceCodeServer: 'Source code server',
      sourceCodeUi: 'Source code UI',
      signIn: 'Đăng nhập bằng Google',
      signingIn: 'Đang đăng nhập...',
      subject: 'Tiêu đề',
      to: 'To',
      unknownPeer: 'Không rõ peer',
      unknownSender: 'Không rõ người gửi',
      unknownTime: 'Không rõ thời gian',
      loadingGroups: 'Đang tải nhóm...',
      loadingMessages: 'Đang tải tin chat...',
      loadingMessage: 'Đang tải nội dung...',
      transcript: 'Transcript',
    },
  } satisfies Record<Language, Record<string, string>>

  let language: Language = 'en'
  let InboxComponent: any = null
  let SettingsPopupComponent: any = null
  let loadingInbox = false
  let loadingSettingsPopup = false
  let settingsOpen = false
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

  async function openSettings() {
    settingsOpen = true
    if (SettingsPopupComponent || loadingSettingsPopup) return

    loadingSettingsPopup = true
    try {
      SettingsPopupComponent = (await import('./lib/SettingsPopup.svelte')).default
    } catch (cause) {
      error = getErrorMessage(cause)
      settingsOpen = false
    } finally {
      loadingSettingsPopup = false
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
          <button type="button" on:click={openSettings} disabled={loadingSettingsPopup}>{t.settings}</button>
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

{#if settingsOpen && SettingsPopupComponent && user}
  <svelte:component this={SettingsPopupComponent} {user} {t} close={() => (settingsOpen = false)} />
{/if}
