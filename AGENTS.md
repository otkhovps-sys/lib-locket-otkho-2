# Repository Guidelines

## Workspace & Prerequisites

- Root is an npm workspace (`workspaces: ["dome"]`); the `locket-sdk` package lives in `dome/`.
- Requires **Node.js >= 22** and **FFmpeg** on `PATH` (or set `FFMPEG_PATH` / `ffmpegPath`).
- `.npmrc` sets `ignore-scripts=true`; `sharp` uses prebuilt platform packages and FFmpeg must be installed separately.

## Commands

Run from workspace root:

- Install: `npm ci`
- Typecheck (`src`, `examples`, `tests`): `npm run typecheck`
- Full test suite: `npm test`
- Single test file: `npx tsx --test dome/tests/<file>.test.ts`
- Build (`dome/dist/`): `npm run build`
- Interactive demo: `npm run demo -- --help`

## Architecture & Code Conventions

- **Entrypoint**: `dome/src/index.ts` re-exports `LocketClient` (`client.ts`), `SessionManager` (`session.ts`), `DeviceProfile` (`device.ts`), feature modules (`modules/user.ts`, `modules/friends.ts`, `modules/moments.ts`, `modules/chat.ts`), `NoteType` (`note-types.ts`), and typed errors (`errors.ts`).
- **ESM & TypeScript (`NodeNext`, `verbatimModuleSyntax`)**:
  - Use explicit `.js` extensions on all relative imports and `import type` for type-only imports.
  - Keep `with { type: 'json' }` on JSON imports (e.g., `dome/src/caption-presets.json`).
  - `tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, and `noUnusedParameters` enabled.
- **API surface**: SDK methods and options use `camelCase`; Locket/Firebase wire payloads and responses retain `snake_case`. Operations throw `AuthenticationError`, `LocketAPIError`, or `StorageUploadError` rather than returning error objects.
- **Persistence**: Default `sessionPath` is `'locket_session.json'`. `my_moments_<uid>.json` and `chat_history_<uid>.json` are written next to `sessionPath` via atomic temp-file renames (`persistence.ts`). Pass `sessionPath: null` to keep all session and history state in memory.
- **Media & SSRF rules**: `MediaProcessor` (`media.ts`) rejects private/loopback IPs, embedded URL credentials, inputs over 256 MiB, and encoded videos >= `VIDEO_SIZE_LIMIT` (6,291,456 bytes).

## Testing

- Runner: Node built-in `node:test` + `node:assert/strict` executed via `tsx --test`.
- Offline isolation: Always pass `sessionPath: null` and inject a custom `fetch` into `new LocketClient({ sessionPath: null, fetch })` (or a local `ws` server with `realtimeUrl`) so tests never touch disk or live Locket/Firebase endpoints.
- Video fixtures: `dome/tests/media.test.ts` synthesizes video fixtures at runtime using FFmpeg `lavfi` (`testsrc2` / `sine`). External fixture files are not required, but `ffmpeg` must be runnable for `media.test.ts` to pass.

## Documentation & Bilingual Parity

- English and Vietnamese docs and examples are paired:
  - `dome/README.md` and `dome/README_VI.md`
  - `dome/docs/FEATURES.md` / `FEATURES_VI.md` and `dome/docs/INTEGRATION.md` / `INTEGRATION_VI.md`
  - `dome/examples/en/*` and `dome/examples/vi/*`
- Update both English and Vietnamese files and run `npm run typecheck` (which typechecks `examples/**/*.ts`) whenever public APIs change.

## Security & Local Data

- Never commit `.env`, `*session.json`, `chat_history*.json`, `my_moments_*.json`, or real credentials/tokens.
