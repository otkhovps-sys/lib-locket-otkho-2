# API Reference

All network/media methods return promises; device configuration, overlay construction and local recording are synchronous. Raw server response fields remain snake_case. See emitted TypeScript declarations for exact types. Use `client.user`, `client.friends`, `client.moments`, and `client.chat` for the modules below.

## Client

| API | Behavior |
| --- | --- |
| `new LocketClient(options?)` | Configure sessionPath, device/deviceOptions, timeoutMs, fetch, ffmpegPath, allowedMediaHosts, realtimeUrl. |
| `isAuthenticated()` | Check whether UID and token are present. |
| `login(email, password)` | Authenticate and persist tokens. |
| `setDevice(options?)` | Update manual metadata or enable automatic metadata. |
| `postApi(endpoint, payload?)` | Send an authenticated API request with analytics. |
| `session.load(), session.save(), session.refresh(), session.getValidToken()` | Manage session persistence and token renewal. |
| `device.userAgent, device.analyticsData, device.defaultHeaders` | Read active metadata. |
| `device.setCustomDevice(options), device.enableAutoEmulation(), device.toJSON(), DeviceProfile.fromJSON(value)` | Configure and serialize a device. |

## User

| API | Behavior |
| --- | --- |
| `getProfile(userUid?), getProfileByUsername(username)` | Look up profiles; self profiles optionally include Auth email/avatar. |
| `updateProfile(attributes), updateName(firstName, lastName), updateBirthdate(date)` | Update profile fields; dates use YYYY-MM-DD. |
| `uploadAvatar(input), updateAvatar(input)` | Upload WebP or apply an existing avatar URL. |
| `syncClientData({ pushNotifications?, autoSync?, extraData? }?)` | Synchronize client preferences. |
| `setNotificationToken(fcmToken?, autoFake?)` | Register an FCM token or generated placeholder. |

## Friends

| API | Behavior |
| --- | --- |
| `getGroupsAndFriends(), getAllFriends(), getFriendRequests()` | Read groups, profiles and incoming/outgoing requests. |
| `resolveInviteTokenFromUsername(username), fetchUserByInviteToken(token)` | Resolve public invite links and profiles. |
| `sendRequest(uid, source?), sendRequestByUsername(username), acceptRequest(uid)` | Send or accept friend requests. |
| `remove(uidOrUsername), block(uidOrUsername), unblock(uidOrUsername)` | Manage friendship/block state. |
| `suggestFriends(phoneContacts?)` | Query contact-based suggestions. |

## Moments

| API | Behavior |
| --- | --- |
| `uploadImage(input), uploadVideo(input, options?)` | Upload media and return Storage URLs. |
| `extractThumbnail(input, timestampSec?), optimizeVideo(input, options?)` | Run FFmpeg; return Buffer data. |
| `buildOverlay({ text?, noteType?, icon?, colors?, textColor? }?)` | Build caption data synchronously using 158 presets. |
| `post({ image?, video?, caption?, noteType?, icon?, colors?, textColor?, isPrivate?, recipients?, autoCompress?, priority?, progressCallback? })` | Publish a moment; image or video is required. |
| `getLatest(), getFilters()` | Read the feed and available camera filters. |
| `getSharedMomentsByUsername(username, limit?), getSharedMomentsByUser(uid, limit?)` | Read paginated moments from one user. |
| `getPostsByUsername(username, limit?), getPostsByUser(uid, limit?)` | Aliases for shared-moment lookups. |
| `getAllMyMoments({ limit?, startDate?, endDate? }?)` | Read local posts and discover shared posts, enriched with views. |
| `recordPostedMoment(moment)` | Record a successful post in account history. |
| `getViews(momentUid), markAsViewed(momentUid)` | Read views/reactions or mark a moment viewed. |
| `react(momentUid, reaction?, fromMemory?), comment(momentUid, receiverUid, text, fromMemory?)` | React to or comment on moments. |
| `getRollcallPosts({ weekOfYear?, year?, source? }?), delete(momentUid)` | Read weekly Rollcall posts or delete a moment. |

## Chat

| API | Behavior |
| --- | --- |
| `getConversations()` | Read conversation summaries and unread counts. |
| `getMessages({ otherUserId?, conversationId?, fetchServer? }?), fetchMessagesFromServer({ otherUserId?, conversationId? }?)` | Read messages in timestamp order. |
| `recordMessage({ conversationId, senderUid, text, receiverUid?, messageId?, clientToken?, timestamp?, reaction?, reactions? })` | Deduplicate cached messages by server ID or client token. |
| `sendMessage(receiverUid, text?, momentUid?), sendMoment(receiverUid, momentUid, text?)` | Send text or share a moment. |
| `deleteMessage(conversationUid, messageUid, validateOwnership?)` | Recall a sent message; ownership checks default to true. |
| `sendReaction(conversationId, messageId, emoji, validateReceiver?), removeReaction(conversationId, messageId)` | Manage emoji reactions; own-message checks default to true. |
| `markAsRead({ conversationUid?, otherUserId?, sendReadReceipt? })` | Mark a conversation read; receipts default to true. |
| `getSupportedReactions(), ChatModule.getSupportedReactions()` | Return a copy of the emoji palette. |
| `listenRealtime(otherUserId, callback, { signal? }?)` | Await ordered realtime events until close/abort. |

## Options and errors

`VideoOptions` contains `targetSizeBytes` (default 5,650,000), `maxDimension` (1080), `preserveResolution` (true), `priority` (`balanced`, `video`, `resolution`, `audio`, `music`), and `progressCallback(percent, status)`. `UploadVideoOptions` also accepts `autoCompress` (true) and `contentType` (`video/mp4`). Date filters accept ISO timestamps or YYYY-MM-DD; end dates include that whole UTC day. Limits must be positive integers.

Exports include `NoteType`, `ReactionEmoji`, `LocketError`, `AuthenticationError`, `LocketAPIError`, `StorageUploadError`, and option/result types. `LocketAPIError` exposes `statusCode` and `responseData`. See [integration](INTEGRATION.md) for persistence, network limits, and error handling, and [migration](MIGRATION.md) for changes from the earlier API.
