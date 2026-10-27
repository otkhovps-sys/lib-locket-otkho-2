# Integration Guide

## Runtime and installation

Use Node.js 22 or later and install FFmpeg separately. Run `npm ci` from the workspace root, then `npm run build`. Import the workspace package using `import { LocketClient } from 'locket-sdk'`; its public declarations accompany the compiled ESM output. Examples can run directly with `npx tsx examples/en/01-login-and-session.ts` from `dome/`.

## Client and persistence

```typescript
import { LocketClient, DeviceProfile } from 'locket-sdk';
const client = new LocketClient({
    sessionPath: './data/session.json',
    device: new DeviceProfile({ autoEmulate: false, installationId: 'my-installation' }),
    timeoutMs: 30_000,
    allowedMediaHosts: ['cdn.example.com']
});
```

An existing session restores its saved device profile. `client.device` and `client.session.device` always refer to the active profile. Call `client.setDevice({ appVersion: '2.68.0' })` for manual overrides, or `client.setDevice({ autoEmulate: true })` for automatic metadata. Device presets describe protocol metadata; they do not guarantee backend acceptance.

Pass credentials to `await client.login(email, password)` only when no session is available. `getValidToken()` refreshes within 60 seconds of expiry and shares in-flight refreshes. `session.save()` writes atomically. `sessionPath: null` disables all session/history disk writes. Store data outside public or synchronized directories when possible.

## Media and moments

```typescript
await client.moments.post({ image: 'photo.jpg', caption: 'Hello', isPrivate: true });
await client.moments.post({ video: 'clip.mp4', priority: 'balanced',
    progressCallback: (percent, status) => console.log(percent, status) });
```

Media input accepts a path, `Uint8Array`/`Buffer`, or a direct HTTP(S) media URL. A webpage URL is not a downloadable video. A previously uploaded URL is reused only when it belongs to the expected Firebase bucket. Image support follows the installed Sharp build; unsupported formats throw. FFmpeg extracts a thumbnail when a video has no explicit image. `autoCompress: false` rejects oversized videos; otherwise the encoded result must pass the size check before uploading. Set `ffmpegPath` or `FFMPEG_PATH` when FFmpeg is outside `PATH`.

`isPrivate: true` sends only to yourself. Supply `recipients: ['FRIEND_UID']` to target specific friends; omit both to broadcast. Private posts cannot also specify recipients.

## Realtime chat

```typescript
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
await client.chat.listenRealtime('FRIEND_UID', async event => {
    console.log(event);
}, { signal: controller.signal });
```

Callbacks run in arrival order and may be asynchronous. Abort closes the socket. Connection failures, abnormal closes, and callback failures reject the listener; reconnect explicitly in your application if needed. `getMessages({ otherUserId, fetchServer: false })` reads local history only.

## Errors and permissions

Catch typed errors at the application boundary. `LocketAPIError` exposes `statusCode` and `responseData`; these may contain personal data, so do not log them unfiltered. HTTP errors, malformed JSON, and backend error envelopes fail explicitly. Optional Firebase Auth profile enrichment may be unavailable. Firestore reaction/history discovery treats 403/404 as unavailable supplemental data; the primary API result remains usable.

## Development

Run `npm run typecheck`, `npm test`, and `npm run build` from the root. Tests cover mocked HTTP/storage, generated FFmpeg media, persistence, and local WebSockets. They do not contact a live Locket account. Keep English and Vietnamese examples/docs aligned when changing public APIs.

Implementation references: [Node fetch](https://nodejs.org/api/globals.html#fetch), [Sharp WebP output](https://sharp.pixelplumbing.com/api-output/#webp), [ws](https://github.com/websockets/ws), [FFmpeg](https://ffmpeg.org/ffmpeg.html).
