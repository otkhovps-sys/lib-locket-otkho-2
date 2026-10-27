# Locket SDK

SDK TypeScript không chính thức cho Locket Camera: đăng nhập, cấu hình thiết bị, hồ sơ, bạn bè, moment ảnh/video, 158 preset caption và chat thời gian thực. Chạy trên Node.js 22+, không dùng trực tiếp trong trình duyệt.

[English](README.md)

## Cài đặt và kiểm tra

Tại thư mục gốc:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Cài FFmpeg trên `PATH`, hoặc đặt `$env:FFMPEG_PATH='C:/ffmpeg/bin/ffmpeg.exe'`. Các test video tự tạo dữ liệu mẫu; không cần tải video ngoài. Mã ESM và khai báo kiểu được tạo trong `dome/dist/`.

`.npmrc` tắt script cài đặt của dependency. Sharp sử dụng gói nhị phân theo nền tảng; FFmpeg được cài riêng.

## Sử dụng

```typescript
import { LocketClient, NoteType } from 'locket-sdk';

const client = new LocketClient({ sessionPath: 'locket_session.json' });
if (!client.isAuthenticated()) {
    const email = process.env.LOCKET_EMAIL;
    const password = process.env.LOCKET_PASSWORD;
    if (!email || !password) throw new Error('Thiếu tài khoản đăng nhập');
    await client.login(email, password);
}

console.log(await client.user.getProfile());
await client.moments.post({
    image: 'photo.jpg',
    noteType: NoteType.PARTY_TIME,
    isPrivate: true
});
```

Các thao tác mạng dùng `async/await`. Hàm và tùy chọn dùng camelCase; tên trường trong phản hồi máy chủ giữ nguyên. Lỗi được ném dưới dạng `AuthenticationError`, `LocketAPIError`, `StorageUploadError`. Dùng `sessionPath: null` để giữ phiên và lịch sử trong bộ nhớ.

## Chạy demo

Tại thư mục gốc, cấu hình tài khoản rồi chạy:

```powershell
$env:LOCKET_EMAIL='you@example.com'
$env:LOCKET_PASSWORD='your-password'
npx tsx dome/examples/vi/interactive-demo.ts
```

Có thể dùng `LOCKET_SESSION_PATH` để nạp phiên JSON đã có. Nếu dùng `.env`, sao chép `dome/.env.example` thành `.env` rồi chạy `node --env-file=.env --import tsx dome/examples/vi/interactive-demo.ts` tại thư mục gốc; SDK không tự đọc `.env`.

Xem [ví dụ](examples/README.md), [tích hợp](docs/INTEGRATION_VI.md), [API](docs/FEATURES_VI.md), [chuyển đổi](docs/MIGRATION.md).

## Dữ liệu và giới hạn

Phiên chứa token nhạy cảm. Lịch sử được lưu theo từng người dùng, cạnh tệp phiên; không cho nhiều tiến trình ghi chung một tệp. URL media phải trỏ đến địa chỉ công khai; các bước chuyển hướng đều được kiểm tra. Khi nhận URL từ người dùng trên máy chủ, đặt `allowedMediaHosts` và dùng chính sách mạng để chặn DNS rebinding. Đầu vào media tối đa 256 MiB; video tải lên phải nhỏ hơn 6.291.456 byte và được kiểm tra lại sau khi nén.

Test backend dùng dữ liệu giả lập, WebSocket dùng máy chủ cục bộ. Chưa xác minh thao tác với tài khoản Locket thật.
