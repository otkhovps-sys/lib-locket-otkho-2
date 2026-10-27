import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { HttpTransport } from './http.js';
import { StorageUploadError } from './errors.js';
import type { MediaInput, ProgressCallback } from './types.js';

export const VIDEO_SIZE_LIMIT = 6_291_456;
export interface VideoOptions {
    targetSizeBytes?: number;
    maxDimension?: number;
    preserveResolution?: boolean;
    priority?: 'balanced' | 'video' | 'resolution' | 'audio' | 'music';
    progressCallback?: ProgressCallback;
}
export interface MediaOptions { ffmpegPath?: string; allowedMediaHosts?: readonly string[] }

const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as const) blocked.addSubnet(ip, prefix, 'ipv4');
for (const [ip, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
    ['2001:db8::', 32], ['64:ff9b::', 96]] as const) blocked.addSubnet(ip, prefix, 'ipv6');

export class MediaProcessor {
    private readonly ffmpeg: string;
    private static readonly MAX_INPUT_BYTES = 256 * 1024 * 1024;
    constructor(private readonly http: HttpTransport, private readonly options: MediaOptions = {}) {
        this.ffmpeg = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';
    }

    private async validateURL(value: string): Promise<URL> {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new StorageUploadError('Invalid media URL');
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (this.options.allowedMediaHosts && !this.options.allowedMediaHosts.includes(host)) throw new StorageUploadError('Media host is not allowed');
        const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
        if (!addresses.length || addresses.some(({ address, family }) => blocked.check(address, family === 6 ? 'ipv6' : 'ipv4'))) {
            throw new StorageUploadError('Media URLs must resolve to public addresses');
        }
        return url;
    }

    async read(input: MediaInput): Promise<Buffer> {
        if (typeof input !== 'string') {
            if (!input.byteLength || input.byteLength > MediaProcessor.MAX_INPUT_BYTES) throw new StorageUploadError('Media must contain 1–268435456 bytes');
            return Buffer.from(input);
        }
        if (!/^https?:\/\//i.test(input)) {
            const info = await stat(input);
            if (!info.isFile() || !info.size || info.size > MediaProcessor.MAX_INPUT_BYTES) throw new StorageUploadError('Invalid media file size');
            return readFile(input);
        }
        let address = input;
        for (let redirect = 0; redirect < 6; redirect++) {
            const url = await this.validateURL(address);
            const response = await this.http.request(url, { redirect: 'manual', signal: AbortSignal.timeout(120_000), headers: { Accept: '*/*' } });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                await response.body?.cancel();
                const location = response.headers.get('location');
                if (!location) throw new StorageUploadError('Missing media redirect location');
                address = new URL(location, url).href;
                continue;
            }
            if (!response.ok || !response.body) {
                await response.body?.cancel();
                throw new StorageUploadError(`Media download failed (HTTP ${response.status})`);
            }
            if (Number(response.headers.get('content-length')) > MediaProcessor.MAX_INPUT_BYTES) {
                await response.body.cancel(); throw new StorageUploadError('Media download is too large');
            }
            const reader = response.body.getReader(), chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > MediaProcessor.MAX_INPUT_BYTES) throw new StorageUploadError('Media download is too large');
                    chunks.push(value);
                }
            } finally { await reader.cancel(); reader.releaseLock(); }
            if (!size) throw new StorageUploadError('Empty media download');
            return Buffer.concat(chunks);
        }
        throw new StorageUploadError('Too many media redirects');
    }

    async toWebp(input: MediaInput, quality = 85): Promise<Buffer> {
        try { return await sharp(await this.read(input)).rotate().webp({ quality }).toBuffer(); }
        catch (error) { throw new StorageUploadError('Image conversion failed', { cause: error }); }
    }

    private run(args: string[], onProgress?: (line: string) => void, allowFailure = false): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn(this.ffmpeg, ['-hide_banner', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '', stderr = '', pending = '', timedOut = false;
            let callbackError: unknown;
            const timer = setTimeout(() => { timedOut = true; child.kill(); }, 600_000);
            child.stdout.on('data', (chunk: Buffer) => {
                stdout = (stdout + chunk.toString()).slice(-64_000);
                pending += chunk.toString();
                const lines = pending.split(/\r?\n/); pending = lines.pop() ?? '';
                try { for (const line of lines) onProgress?.(line); }
                catch (error) { callbackError = error; child.kill(); }
            });
            child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-64_000); });
            child.once('error', error => { clearTimeout(timer); reject(new StorageUploadError('Cannot run FFmpeg; install it or set FFMPEG_PATH', { cause: error })); });
            child.once('close', code => {
                clearTimeout(timer);
                if (callbackError !== undefined) reject(callbackError);
                else if (timedOut || (code !== 0 && !allowFailure)) reject(new StorageUploadError(timedOut ? 'FFmpeg timed out' : `FFmpeg failed: ${stderr.slice(-2000)}`));
                else resolve({ stdout, stderr });
            });
        });
    }

    private async withVideo<T>(input: MediaInput, action: (inputPath: string, dir: string) => Promise<T>): Promise<T> {
        const bytes = await this.read(input);
        const dir = await mkdtemp(join(tmpdir(), 'locket-media-'));
        try {
            const path = join(dir, 'input.mp4');
            await writeFile(path, bytes);
            return await action(path, dir);
        } finally { await rm(dir, { recursive: true, force: true }); }
    }

    async extractThumbnail(input: MediaInput, timestampSec = 1): Promise<Buffer> {
        if (!Number.isFinite(timestampSec) || timestampSec < 0) throw new RangeError('timestampSec must be nonnegative');
        return this.withVideo(input, async (path, dir) => {
            const output = join(dir, 'frame.png');
            await this.run(['-y', '-ss', String(timestampSec), '-i', path, '-frames:v', '1', output]);
            try { return await this.toWebp(await readFile(output)); }
            catch (error) { throw new StorageUploadError('No frame exists at the requested timestamp', { cause: error }); }
        });
    }

    async optimizeVideo(input: MediaInput, options: VideoOptions = {}): Promise<Buffer> {
        const { targetSizeBytes = 5_650_000, maxDimension = 1080, preserveResolution = true, priority = 'balanced', progressCallback } = options;
        if (!Number.isInteger(targetSizeBytes) || targetSizeBytes < 10_000 || targetSizeBytes >= VIDEO_SIZE_LIMIT) throw new RangeError('Invalid video target size');
        if (!Number.isInteger(maxDimension) || maxDimension < 2) throw new RangeError('maxDimension must be at least 2');
        return this.withVideo(input, async (path, dir) => {
            const probe = await this.run(['-i', path], undefined, true);
            const match = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(probe.stderr);
            if (!match) throw new StorageUploadError('Cannot determine video duration');
            const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            if (duration <= 0) throw new StorageUploadError('Video has no duration');
            const hasAudio = probe.stderr.includes('Audio:');
            const audioFirst = ['audio', 'music'].includes(priority), videoFirst = ['video', 'resolution'].includes(priority);
            const tier = duration > 300 ? 0 : duration > 120 ? 1 : duration > 45 ? 2 : 3;
            const audioRate = !hasAudio ? 0 : (audioFirst ? [64, 96, 128, 160] : videoFirst ? [24, 32, 48, 64] : [32, 64, 96, 128])[tier]!;
            const totalRate = targetSizeBytes * 8 / duration / 1000 * 0.88;
            let videoRate = Math.min(4000, Math.max(16, totalRate - Math.min(audioRate, totalRate * 0.3)));
            const actualAudio = Math.max(8, Math.min(audioRate, Math.floor(totalRate * 0.3)));
            const encoders = await this.run(['-encoders']);
            const hevc = preserveResolution && encoders.stdout.includes('libx265');
            const scale = preserveResolution ? 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
                : `scale=w='min(${maxDimension},iw)':h='min(${maxDimension},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
            const output = join(dir, 'output.mp4');
            for (let attempt = 0; attempt < 3; attempt++) {
                const args = ['-y', '-i', path, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', hevc ? 'libx265' : 'libx264',
                    '-pix_fmt', 'yuv420p', '-preset', duration > 180 ? 'veryfast' : 'fast', '-b:v', `${Math.floor(videoRate)}k`,
                    '-maxrate', `${Math.floor(videoRate)}k`, '-bufsize', `${Math.floor(videoRate * 1.5)}k`, '-vf', scale,
                    '-g', duration > 300 ? '48' : '60', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats'];
                if (hevc) args.push('-tag:v', 'hvc1', '-x265-params', 'open-gop=0:repeat-headers=1:pools=2');
                if (duration > 120) args.push('-r', duration > 300 ? '24' : '30');
                args.push(...(hasAudio ? ['-c:a', 'aac', '-b:a', `${actualAudio}k`] : ['-an']), output);
                await this.run(args, line => {
                    if (line.startsWith('out_time_us=')) {
                        const percent = Math.min(99, Math.max(0, Math.floor(Number(line.slice(12)) / 1e6 / duration * 100)));
                        if (Number.isFinite(percent)) progressCallback?.(percent, `Encoding video (${percent}%)`);
                    }
                });
                const result = await readFile(output);
                if (result.length <= targetSizeBytes && result.length < VIDEO_SIZE_LIMIT) {
                    progressCallback?.(100, 'Video ready'); return result;
                }
                videoRate *= targetSizeBytes / result.length * 0.85;
            }
            throw new StorageUploadError('Encoded video still exceeds the requested size');
        });
    }
}
