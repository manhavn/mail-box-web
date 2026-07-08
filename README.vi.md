# Mailbox Web

Mailbox Web là app Svelte 5 + TypeScript + Vite dùng để đọc email được Rust `mail-box` SMTP receiver lưu vào Firebase Realtime Database.

App xem mỗi path cấp cao nhất trong Firebase Realtime Database là một nhóm tin nhắn. Mỗi nhóm chứa các child push id của Firebase, và mỗi child là một payload email đã nhận.

Tài liệu tiếng Anh: [README.md](./README.md)

## Tính Năng

- Đăng nhập Google bằng Firebase Authentication.
- Đọc Realtime Database REST bằng Firebase ID token.
- Các nhóm tin nhắn được lấy từ top-level paths của database.
- Hiển thị số lượng tin trong mỗi nhóm.
- Danh sách tin hiển thị push id, thời gian nhận, người gửi và người nhận.
- URL database và địa chỉ email dài có thể xem đầy đủ bằng hover title.
- Danh sách tin không tải `data` và `transcript`; chỉ khi chọn một tin mới tải payload đầy đủ.
- Nội dung tin đầy đủ được hiển thị theo các text box.
- Công tắc ngôn ngữ EN/VI và lưu lựa chọn bằng `localStorage`. Mặc định là tiếng Anh.
- Lazy-load chunk inbox để người chưa đăng nhập không phải tải toàn bộ code đọc mailbox.
- Tách Firebase SDK thành build chunk riêng để cache tốt hơn.
- Có sẵn cấu hình Firebase Hosting và Realtime Database rules.

## Cấu Trúc Database Mong Đợi

Rust `mail-box` ghi dữ liệu vào:

```text
{firebase-url}/{firebase-path}.json
```

Mỗi `firebase-path` sẽ hiển thị trong app như một nhóm tin nhắn. Firebase tạo push-id child khi Rust app gửi request `POST`.

Payload mẫu:

```json
{
  "peer_addr": "127.0.0.1:54321",
  "from": "sender@example.com",
  "recipients": ["receiver@example.com"],
  "data": "From: <sender@example.com>\nTo: <receiver@example.com>\nSubject: test\n\nHello\n",
  "transcript": "S: 220 mail-box ready\r\nC: EHLO localhost\r\n...",
  "received_at": "2026-07-08T12:00:00Z"
}
```

## Thiết Lập Firebase Từ Project Mới

### 1. Tạo Firebase Project

1. Mở [Firebase Console](https://console.firebase.google.com/).
2. Tạo project mới.
3. Thêm Web app vào project.
4. Copy các giá trị Firebase Web SDK config.

App cần các giá trị này:

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

### 2. Bật Đăng Nhập Google

1. Vào `Authentication > Sign-in method`.
2. Bật provider `Google`.
3. Vào `Authentication > Settings > Authorized domains`.
4. Thêm domain Firebase Hosting, ví dụ `PROJECT_ID.web.app`.
5. Nếu đăng nhập báo `auth/admin-restricted-operation`, vào `Authentication > Settings > User actions` và cho phép client sign-up/tạo user.

### 3. Tạo Realtime Database

1. Vào `Realtime Database`.
2. Tạo database.
3. Chọn region bạn muốn dùng.
4. Copy database URL. URL này phải khớp với `VITE_FIREBASE_DATABASE_URL`.

Project này có sẵn `database.rules.json`:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": true
  }
}
```

`read` yêu cầu user đã đăng nhập Firebase. `write` đang public để Rust SMTP receiver vẫn có thể post message bằng URL. Nếu bạn khóa `.write`, hãy đảm bảo service ghi dữ liệu có Firebase Auth token hợp lệ hoặc dùng chiến lược ghi server-side khác.

### 4. Thiết Lập Firebase Hosting

Repository này đã có `firebase.json` cấu hình cho output của Vite:

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

Nếu bắt đầu từ đầu, chạy:

```sh
firebase init hosting database
```

Chọn `dist` làm public directory và giữ `database.rules.json` làm file database rules.

## Biến Môi Trường

Copy file mẫu:

```sh
cp .env.example .env
```

Điền `.env`:

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

`.env` đã nằm trong `.gitignore`. Commit `.env.example`, không commit `.env`.

## Cài Đặt Và Chạy Local

Cài dependencies:

```sh
npm install
```

Chạy dev server:

```sh
npm run dev
```

Mở URL local do Vite in ra, sau đó đăng nhập bằng Google.

## Build, Check Và Lint

Kiểm tra type Svelte và TypeScript:

```sh
npm run check
```

Chạy manual lint script:

```sh
npm run lint:manual
```

Build production:

```sh
npm run build
```

Output production nằm trong `dist`.

## Deploy

Deploy Realtime Database rules:

```sh
npm run deploy:database
```

Build và deploy Firebase Hosting:

```sh
npm run deploy:hosting
```

Script deploy hosting sẽ chạy `npm run build` trước.

## Kết Nối Rust SMTP Receiver

Chạy Rust `mail-box` receiver với Firebase:

```sh
./target/release/mail-box \
  --firebase-url https://PROJECT_ID-default-rtdb.REGION.firebasedatabase.app \
  --firebase-path support
```

Mỗi giá trị `--firebase-path` sẽ xuất hiện trong web app như một nhóm tin nhắn.

## Scripts Hữu Ích

- `npm run dev`: chạy Vite dev server.
- `npm run build`: build production app.
- `npm run preview`: preview production build trên local.
- `npm run check`: chạy `svelte-check` và TypeScript checks.
- `npm run lint:manual`: chạy `oxlint` và type checks.
- `npm run deploy:database`: deploy Realtime Database rules.
- `npm run deploy:hosting`: build và deploy Firebase Hosting.

## Ghi Chú

- Firebase Web config là cấu hình public cho client, nhưng vẫn nên giữ `.env` local để quản lý rõ từng môi trường.
- Bảo mật Realtime Database nằm ở `database.rules.json`, không nằm ở việc ẩn database URL.
- Nếu Google sign-in chạy local nhưng lỗi trên hosting, kiểm tra Firebase Auth authorized domains.
- Nếu đọc database lỗi sau khi đăng nhập, deploy database rules mới nhất và kiểm tra database URL trong `.env`.
