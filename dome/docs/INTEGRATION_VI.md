# Hướng dẫn tích hợp

## Môi trường

Dùng Node.js 22+ và FFmpeg trên `PATH` hoặc biến `FFMPEG_PATH`. Chạy `npm ci`, `npm run typecheck`, `npm test`, `npm run build` tại thư mục gốc. Gói ESM và khai báo kiểu nằm trong `dome/dist/`. Chạy ví dụ trực tiếp bằng `npx tsx examples/vi/01-login-and-session.ts` từ `dome/`.

## Khởi tạo và lưu phiên

```typescript
import { LocketClient, DeviceProfile } from 'locket-sdk';
const client = new LocketClient({
    sessionPath: './data/session.json',
    device: new DeviceProfile({ autoEmulate: false, installationId: 'my-installation' }),
    timeoutMs: 30_000,
    allowedMediaHosts: ['cdn.example.com']
});
```

Nếu tệp phiên đã tồn tại, cấu hình thiết bị trong tệp được khôi phục. `client.device` và `client.session.device` luôn cùng trỏ tới thiết bị đang dùng. Gọi `client.setDevice({ appVersion: '2.68.0' })` để chỉnh thủ công; dùng `{ autoEmulate: true }` để bật lại metadata tự động. Metadata thiết bị không bảo đảm máy chủ chấp nhận yêu cầu.

Đăng nhập bằng `await client.login(email, password)`. Token được làm mới trước khi hết hạn 60 giây; các yêu cầu đồng thời dùng chung một lần làm mới. Phiên được ghi nguyên tử. `sessionPath: null` tắt ghi phiên và lịch sử xuống đĩa. Giữ tệp phiên riêng tư vì có access token và refresh token.

## Ảnh và video

```typescript
await client.moments.post({ image: 'photo.jpg', caption: 'Xin chào', isPrivate: true });
await client.moments.post({ video: 'clip.mp4', priority: 'audio',
    progressCallback: (percent, status) => console.log(percent, status) });
```

Đầu vào là đường dẫn, `Uint8Array`/`Buffer`, hoặc URL HTTP(S) trỏ trực tiếp tới tệp. URL trang web không phải URL video. Chỉ tái sử dụng trực tiếp URL Firebase đúng bucket. Sharp chuyển ảnh sang WebP; định dạng không được bản Sharp hỗ trợ sẽ báo lỗi. FFmpeg tự lấy thumbnail nếu chỉ truyền video.

Video phải nhỏ hơn 6.291.456 byte. Khi vượt giới hạn, SDK nén và kiểm tra lại; `autoCompress: false` báo lỗi ngay. Có thể truyền `ffmpegPath` khi không dùng `PATH`. Giới hạn đầu vào là 256 MiB.

`isPrivate: true` chỉ gửi cho mình. `recipients: ['FRIEND_UID']` gửi cho những người được chỉ định. Bỏ cả hai để gửi cho toàn bộ bạn bè. Không kết hợp chế độ riêng tư với danh sách người nhận.

URL media phải phân giải tới địa chỉ công khai; mỗi chuyển hướng được kiểm tra lại. Khi xử lý URL do người khác cung cấp, đặt `allowedMediaHosts` và giới hạn mạng đầu ra để ngăn DNS rebinding.

## Chat thời gian thực

```typescript
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
await client.chat.listenRealtime('FRIEND_UID', async event => {
    console.log(event);
}, { signal: controller.signal });
```

Callback được chờ theo thứ tự nhận tin. Abort đóng kết nối. Lỗi kết nối, đóng bất thường hoặc lỗi callback làm Promise bị từ chối; ứng dụng tự quyết định kết nối lại. `getMessages({ otherUserId, fetchServer: false })` chỉ đọc lịch sử cục bộ. Lịch sử tách theo người dùng; không cho nhiều tiến trình ghi cùng tệp.

## Xử lý lỗi và kiểm thử

Bắt `AuthenticationError`, `LocketAPIError`, `StorageUploadError` ở lớp ứng dụng. `LocketAPIError.statusCode` và `responseData` hỗ trợ chẩn đoán; không ghi dữ liệu nhạy cảm ra log. HTTP lỗi, JSON sai và phản hồi API báo lỗi đều được ném thành ngoại lệ.

Dữ liệu bổ sung từ Firebase Auth có thể không có. Khi Firestore trả 403/404 cho reactions hoặc bước tìm lịch sử moment, dữ liệu bổ sung đó được bỏ qua. Kết quả API chính vẫn dùng được.

Test dùng HTTP giả lập, video được FFmpeg tạo và WebSocket cục bộ; chưa xác minh bằng tài khoản Locket thật. Giữ tài liệu và ví dụ tiếng Anh/Việt đồng bộ khi đổi API.

Tham khảo: [Node fetch](https://nodejs.org/api/globals.html#fetch), [Sharp WebP](https://sharp.pixelplumbing.com/api-output/#webp), [ws](https://github.com/websockets/ws), [FFmpeg](https://ffmpeg.org/ffmpeg.html).
