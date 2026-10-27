# Runnable examples / Ví dụ chạy được

Run commands from `dome/` after `npm ci` at the workspace root. Set `LOCKET_EMAIL` and `LOCKET_PASSWORD` or `LOCKET_SESSION_PATH`. Scripts do not load `.env` automatically. Media examples require FFmpeg and use private posts by default.

Chạy từ `dome/`, cấu hình tài khoản hoặc đường dẫn phiên. Ví dụ ảnh/video mặc định chỉ gửi cho mình. Tệp `.env` không tự được nạp.

| Example | Command (English) | Nội dung |
| --- | --- | --- |
| Login/session | `npx tsx examples/en/01-login-and-session.ts` | Đăng nhập, khôi phục phiên |
| Profile | `npx tsx examples/en/02-user-profile.ts` | Hồ sơ và cách cập nhật |
| Image | `npx tsx examples/en/03-post-image-moment.ts photo.jpg` | Đăng ảnh riêng tư |
| Video | `npx tsx examples/en/04-post-video-moment.ts clip.mp4` | Nén video và tạo thumbnail |
| Feed/views | `npx tsx examples/en/05-feed-views-reactions.ts MOMENT_UID` | Bảng tin, lượt xem |
| Friends | `npx tsx examples/en/06-friends-and-contacts.ts` | Bạn bè, lời mời |
| Chat | `npx tsx examples/en/07-chat-and-reactions.ts FRIEND_UID --listen` | Lịch sử và realtime; Ctrl+C để dừng |
| Interactive | `npx tsx examples/en/interactive-demo.ts` | Menu thao tác |

Replace `en` with `vi` for the Vietnamese entry points. Thay `en` bằng `vi` để dùng ví dụ tiếng Việt. Commented calls show optional mutations; uncomment them only when you intend to perform those actions. Some operations affect other users or share media with friends.
