import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { LocketClient, StorageUploadError, VIDEO_SIZE_LIMIT } from '../src/index.js';

const run = promisify(execFile);

test('real images convert to WebP and resumable uploads transfer the converted bytes', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer();
    let transferred = false;
    const client = new LocketClient({ sessionPath: null, fetch: async (url, init) => {
        if (String(url).includes('uploadType=resumable')) {
            const meta = JSON.parse(String(init?.body));
            assert.equal(meta.contentType, 'image/webp');
            assert.equal(meta.metadata.creator, 'self');
            return new Response(null, { headers: { 'x-goog-upload-url': 'https://firebasestorage.googleapis.com/upload/session' } });
        }
        assert.equal(init?.method, 'PUT');
        const bytes = Buffer.from(init!.body as Uint8Array);
        assert.equal((await sharp(bytes).metadata()).format, 'webp');
        assert.equal(new Headers(init?.headers).get('x-goog-upload-content-length'), String(bytes.length));
        transferred = true;
        return Response.json({ downloadTokens: 'first,second' });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    const url = new URL(await client.moments.uploadImage(png));
    assert.equal(url.searchParams.get('token'), 'first');
    assert.equal(url.searchParams.get('alt'), 'media');
    assert.equal(transferred, true);
});

test('storage refuses missing download tokens and untrusted upload locations', async () => {
    let badLocation = true;
    const client = new LocketClient({ sessionPath: null, fetch: async (url) => {
        if (String(url).includes('uploadType=resumable')) return new Response(null, { headers: {
            'x-goog-upload-url': badLocation ? 'https://attacker.example/upload' : 'https://firebasestorage.googleapis.com/upload/session'
        } });
        return Response.json({});
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await assert.rejects(client.storage.upload(Buffer.from('video'), 'video', 'video/mp4'), /Untrusted/);
    badLocation = false;
    await assert.rejects(client.storage.upload(Buffer.from('video'), 'video', 'video/mp4'), /download token/);
});

test('remote media refuses private addresses, embedded credentials, and unapproved hosts', async () => {
    const client = new LocketClient({ sessionPath: null, allowedMediaHosts: ['127.0.0.1', '::1'], fetch: async () => { throw new Error('Must not fetch'); } });
    await assert.rejects(client.media.read('http://127.0.0.1/a'), StorageUploadError);
    await assert.rejects(client.media.read('http://[::1]/a'), StorageUploadError);
    await assert.rejects(client.media.read('https://user:pass@example.com/a'), StorageUploadError);
    await assert.rejects(client.media.read('https://example.com/a'), /not allowed/);
});

test('invalid images fail conversion instead of being mislabeled WebP', async () => {
    const client = new LocketClient({ sessionPath: null });
    await assert.rejects(client.media.toWebp(Buffer.from('invalid image')), StorageUploadError);
});

test('real FFmpeg thumbnails and compression work without external video fixtures', { timeout: 60_000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'locket-video-test-'));
    try {
        const path = join(dir, 'fixture.mp4');
        await run(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=24',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path], { windowsHide: true });
        const client = new LocketClient({ sessionPath: null });
        const thumbnail = await client.moments.extractThumbnail(await readFile(path), 0.5);
        assert.equal((await sharp(thumbnail).metadata()).format, 'webp');
        const progress: number[] = [];
        const compressed = await client.moments.optimizeVideo(path, { targetSizeBytes: 100_000, preserveResolution: false,
            maxDimension: 80, priority: 'audio', progressCallback: percent => progress.push(percent) });
        assert.ok(compressed.length > 0 && compressed.length <= 100_000 && compressed.length < VIDEO_SIZE_LIMIT);
        assert.equal(progress.at(-1), 100);
        const smaller = await sharp(await client.moments.extractThumbnail(compressed, 0.5)).metadata();
        assert.ok(smaller.width! <= 80 && smaller.height! <= 80);
        const hevc = await client.moments.optimizeVideo(path, { targetSizeBytes: 200_000, preserveResolution: true });
        const full = await sharp(await client.moments.extractThumbnail(hevc, 0.5)).metadata();
        assert.equal(full.width, 160);
        assert.equal(full.height, 120);
        await assert.rejects(client.moments.optimizeVideo(path, { targetSizeBytes: 100_000, preserveResolution: false,
            progressCallback: () => { throw new Error('progress cancelled'); } }), /progress cancelled/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test('unavailable FFmpeg reports an actionable typed error', async () => {
    const client = new LocketClient({ sessionPath: null, ffmpegPath: 'definitely-missing-ffmpeg' });
    await assert.rejects(client.moments.extractThumbnail(Buffer.from('video')), /FFMPEG_PATH/);
});
