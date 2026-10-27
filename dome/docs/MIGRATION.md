# TypeScript Migration

Version 2 uses TypeScript and Node.js ESM. Install with `npm ci` at the workspace root, then build with `npm run build`. Python packaging and source files have been replaced. FFmpeg is now an explicit system requirement.

## API conventions

All network/media methods return promises. Use `await`. Method and option names use camelCase; backend response fields and persisted JSON fields retain snake_case where applicable. The client uses an options object, for example `new LocketClient({ sessionPath: 'existing-session.json' })`.

| Previous API | TypeScript equivalent |
| --- | --- |
| `is_authenticated`, `set_device`, `post_api` | `isAuthenticated`, `setDevice`, `postApi` |
| `get_valid_token`, `session_path`, `id_token` | `getValidToken`, `sessionPath`, `idToken` |
| `get_profile`, `update_name`, `update_avatar` | `getProfile`, `updateName`, `updateAvatar` |
| `sync_client_data(...)` | `syncClientData({ pushNotifications, autoSync, extraData })` |
| `build_overlay(...)` | `buildOverlay({ text, noteType, icon, colors, textColor })` |
| `post(image=..., ...)` | `post({ image, video, caption, noteType, isPrivate, recipients })` |
| `upload_video`, `optimize_video` | `uploadVideo(input, options)`, `optimizeVideo(input, options)` |
| `get_all_my_moments(...)` | `getAllMyMoments({ limit, startDate, endDate })` |
| `get_rollcall_posts(...)` | `getRollcallPosts({ weekOfYear, year, source })` |
| `get_posts_by_username`, `get_posts_by_user` | `getPostsByUsername`, `getPostsByUser` |
| `get_messages`, `fetch_messages_from_server` | `getMessages({ otherUserId, conversationId, fetchServer })`, `fetchMessagesFromServer({ otherUserId, conversationId })` |
| `record_message(...)` | `recordMessage({ conversationId, senderUid, receiverUid, text, messageId, clientToken, timestamp, reaction })` |
| `mark_as_read(...)` | `markAsRead({ conversationUid, otherUserId, sendReadReceipt })` |
| `listen_realtime(...)` | `listenRealtime(otherUserId, onMessage, { signal })` |
| `to_dict`, `from_dict` | `toJSON`, `DeviceProfile.fromJSON` |

Other public methods follow the same snake_case → camelCase conversion. See [the complete method catalog](FEATURES.md). `NoteType` retains all 158 symbolic keys and preset IDs. `ReactionEmoji` retains its named emoji constants and palettes. `Uint8Array`/`Buffer` replaces Python `bytes`.

## Compatibility and behavior changes

Existing session JSON remains readable when its path is provided explicitly. The default session filename is `locket_session.json`. The saved device is restored as the active device.

Moment histories remain `my_moments_<uid>.json` beside the session file. Chat history now uses `chat_history_<uid>.json` for account isolation. The old shared chat cache is not loaded automatically; keep it separately if needed. `sessionPath: null` keeps all new state in memory.

Errors now throw typed exceptions rather than returning error-shaped results. Invalid image conversion fails explicitly. Download tokens must come from Storage; the SDK never invents one. Input URLs are restricted to public addresses, input size is capped, and encoded videos are checked again before upload. Invalid dates/limits and empty posts fail early. A private post cannot specify recipients. A Firebase URL is reused only for the expected bucket.

HTTP traffic uses Node fetch; its TLS/network behavior differs from the previous Python transport. API endpoints and payload shapes have been ported from the local source, but live service acceptance has not been verified. Offline tests cover authentication, refresh, persistence, HTTP envelopes, Firestore pagination, media, and realtime connections.
