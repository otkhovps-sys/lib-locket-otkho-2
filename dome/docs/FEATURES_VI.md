# Danh sách API

Các hàm mạng/media trả về Promise; cấu hình thiết bị, tạo overlay và ghi lịch sử cục bộ là đồng bộ. Tên trường phản hồi máy chủ giữ snake_case. Kiểu đầy đủ nằm trong khai báo TypeScript được build. Truy cập các module qua `client.user`, `client.friends`, `client.moments`, `client.chat`.

## Khởi tạo và phiên

| API | Chức năng |
| --- | --- |
| `new LocketClient(options?)` | Cấu hình phiên, thiết bị, timeout, transport và FFmpeg. |
| `isAuthenticated()` | Kiểm tra đã có UID và token. |
| `login(email, password)` | Đăng nhập và lưu token. |
| `setDevice(options?)` | Đổi metadata thiết bị hoặc bật chế độ tự động. |
| `postApi(endpoint, payload?)` | Gửi API đã xác thực kèm analytics. |
| `session.load(), session.save(), session.refresh(), session.getValidToken()` | Nạp/lưu phiên và làm mới token. |
| `device.userAgent, device.analyticsData, device.defaultHeaders` | Đọc metadata đang dùng. |
| `device.setCustomDevice(options), device.enableAutoEmulation(), device.toJSON(), DeviceProfile.fromJSON(value)` | Cấu hình và tuần tự hóa thiết bị. |

## Hồ sơ

| API | Chức năng |
| --- | --- |
| `getProfile(userUid?), getProfileByUsername(username)` | Tra hồ sơ; hồ sơ của mình có thể bổ sung email/avatar từ Auth. |
| `updateProfile(attributes), updateName(firstName, lastName), updateBirthdate(date)` | Cập nhật hồ sơ; ngày sinh dùng YYYY-MM-DD. |
| `uploadAvatar(input), updateAvatar(input)` | Tải avatar WebP hoặc đặt URL đã có. |
| `syncClientData({ pushNotifications?, autoSync?, extraData? }?)` | Đồng bộ tùy chọn ứng dụng. |
| `setNotificationToken(fcmToken?, autoFake?)` | Đăng ký token FCM hoặc giá trị giả lập. |

## Bạn bè

| API | Chức năng |
| --- | --- |
| `getGroupsAndFriends(), getAllFriends(), getFriendRequests()` | Đọc nhóm, bạn bè và lời mời đến/đi. |
| `resolveInviteTokenFromUsername(username), fetchUserByInviteToken(token)` | Tra invite token và hồ sơ. |
| `sendRequest(uid, source?), sendRequestByUsername(username), acceptRequest(uid)` | Gửi hoặc chấp nhận lời mời. |
| `remove(uidOrUsername), block(uidOrUsername), unblock(uidOrUsername)` | Hủy kết bạn, chặn hoặc bỏ chặn. |
| `suggestFriends(phoneContacts?)` | Tìm gợi ý từ danh bạ. |

## Moment ảnh/video

| API | Chức năng |
| --- | --- |
| `uploadImage(input), uploadVideo(input, options?)` | Tải media và nhận URL Storage. |
| `extractThumbnail(input, timestampSec?), optimizeVideo(input, options?)` | Xử lý bằng FFmpeg, trả về Buffer. |
| `buildOverlay({ text?, noteType?, icon?, colors?, textColor? }?)` | Tạo caption đồng bộ từ 158 preset. |
| `post({ image?, video?, caption?, noteType?, icon?, colors?, textColor?, isPrivate?, recipients?, autoCompress?, priority?, progressCallback? })` | Đăng moment; bắt buộc có ảnh hoặc video. |
| `getLatest(), getFilters()` | Đọc bảng tin và bộ lọc. |
| `getSharedMomentsByUsername(username, limit?), getSharedMomentsByUser(uid, limit?)` | Đọc moment theo người dùng và phân trang. |
| `getPostsByUsername(username, limit?), getPostsByUser(uid, limit?)` | Tên thay thế cho các hàm đọc moment. |
| `getAllMyMoments({ limit?, startDate?, endDate? }?)` | Đọc lịch sử và tìm moment đã chia sẻ, kèm lượt xem. |
| `recordPostedMoment(moment)` | Ghi moment vào lịch sử tài khoản. |
| `getViews(momentUid), markAsViewed(momentUid)` | Đọc lượt xem/reaction hoặc đánh dấu đã xem. |
| `react(momentUid, reaction?, fromMemory?), comment(momentUid, receiverUid, text, fromMemory?)` | Thả cảm xúc hoặc bình luận moment. |
| `getRollcallPosts({ weekOfYear?, year?, source? }?), delete(momentUid)` | Đọc Rollcall theo tuần hoặc xóa moment. |

## Chat

| API | Chức năng |
| --- | --- |
| `getConversations()` | Đọc hội thoại và số tin chưa đọc. |
| `getMessages({ otherUserId?, conversationId?, fetchServer? }?), fetchMessagesFromServer({ otherUserId?, conversationId? }?)` | Đọc tin theo thứ tự thời gian. |
| `recordMessage({ conversationId, senderUid, text, receiverUid?, messageId?, clientToken?, timestamp?, reaction?, reactions? })` | Gộp tin trùng theo ID hoặc client token. |
| `sendMessage(receiverUid, text?, momentUid?), sendMoment(receiverUid, momentUid, text?)` | Gửi tin hoặc chia sẻ moment. |
| `deleteMessage(conversationUid, messageUid, validateOwnership?)` | Thu hồi tin; mặc định kiểm tra chủ sở hữu. |
| `sendReaction(conversationId, messageId, emoji, validateReceiver?), removeReaction(conversationId, messageId)` | Quản lý reaction; mặc định chặn thả cảm xúc vào tin của mình. |
| `markAsRead({ conversationUid?, otherUserId?, sendReadReceipt? })` | Đánh dấu đã đọc; mặc định gửi thông báo đã xem. |
| `getSupportedReactions(), ChatModule.getSupportedReactions()` | Lấy bản sao bảng emoji. |
| `listenRealtime(otherUserId, callback, { signal? }?)` | Nhận sự kiện realtime theo thứ tự đến khi đóng/abort. |

## Tùy chọn và lỗi

`VideoOptions` gồm `targetSizeBytes` (mặc định 5.650.000), `maxDimension` (1080), `preserveResolution` (true), `priority` (`balanced`, `video`, `resolution`, `audio`, `music`) và `progressCallback(percent, status)`. `UploadVideoOptions` bổ sung `autoCompress` (true), `contentType` (`video/mp4`). Bộ lọc ngày nhận ISO timestamp hoặc YYYY-MM-DD; ngày kết thúc bao gồm cả ngày đó theo UTC. `limit` phải là số nguyên dương.

Các export gồm `NoteType`, `ReactionEmoji`, `LocketError`, `AuthenticationError`, `LocketAPIError`, `StorageUploadError` và các kiểu tham số/kết quả. `LocketAPIError` có `statusCode`, `responseData`. Xem [hướng dẫn tích hợp](INTEGRATION_VI.md) về lưu phiên, giới hạn mạng và xử lý lỗi; [ghi chú chuyển đổi](MIGRATION.md) mô tả API cũ và mới.
