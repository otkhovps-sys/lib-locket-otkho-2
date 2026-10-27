# Locket SDK

An unofficial TypeScript SDK for Locket Camera, with authentication, device profiles, user profiles, friends, photo/video moments, caption presets, and realtime chat. Requires Node.js 22+. This package targets Node.js; filesystem, Sharp, and FFmpeg features do not run in a browser.

[Tiếng Việt](README_VI.md)

## Setup

From the workspace root, run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. The tests generate small video fixtures and require FFmpeg on `PATH`; alternatively set `FFMPEG_PATH` to its executable. The resulting ESM package and declarations are in `dome/dist/`.

Dependency scripts are disabled in `.npmrc`. Sharp uses its platform packages. FFmpeg is installed separately; the SDK never downloads executable binaries.

## Usage

```typescript
import { LocketClient, NoteType } from 'locket-sdk';

const client = new LocketClient({ sessionPath: 'locket_session.json' });
if (!client.isAuthenticated()) {
    const { LOCKET_EMAIL: email, LOCKET_PASSWORD: password } = process.env;
    if (!email || !password) throw new Error('Missing credentials');
    await client.login(email, password);
}

console.log(await client.user.getProfile());
await client.moments.post({
    image: 'photo.jpg',
    noteType: NoteType.PARTY_TIME,
    isPrivate: true
});
```

Use `sessionPath: null` to keep sessions and history in memory. HTTP operations return promises; use `await`. SDK methods and options use camelCase; server response fields retain their original names. Errors throw `AuthenticationError`, `LocketAPIError`, or `StorageUploadError` instead of returning error objects.

## Examples and documentation

Run `npm run demo -- --help` from the workspace root, or `npx tsx examples/en/interactive-demo.ts` from `dome/`. Set `LOCKET_EMAIL` and `LOCKET_PASSWORD`, or point `LOCKET_SESSION_PATH` at an existing session file. See [examples](examples/README.md), [integration](docs/INTEGRATION.md), [API reference](docs/FEATURES.md), and [migration notes](docs/MIGRATION.md).

## Local data and network access

Session files contain access and refresh tokens. Keep them private. History is scoped by user and stored beside the session file; do not share one file between multiple processes. Remote media URLs must resolve to public addresses; redirects are checked. Set `allowedMediaHosts` when accepting URLs in a server application, and use an outbound network policy to prevent DNS rebinding. Media input is limited to 256 MiB. Video uploads must be smaller than 6,291,456 bytes; oversized videos are compressed and checked again.

Tests use mocked backend calls and a local WebSocket server. Live Locket service behavior requires an account and is not verified by the offline suite.
