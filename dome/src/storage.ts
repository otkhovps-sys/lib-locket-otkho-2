import { randomUUID } from 'node:crypto';
import type { LocketClient } from './client.js';
import { SessionManager } from './session.js';
import { StorageUploadError } from './errors.js';
import { text } from './types.js';

export class StorageClient {
    constructor(private readonly client: LocketClient) {}

    async upload(bytes: Uint8Array, kind: 'image' | 'video' | 'avatar', contentType: string): Promise<string> {
        const token = await this.client.session.getValidToken();
        const uid = this.client.session.uid;
        if (!uid) throw new StorageUploadError('An authenticated user is required');
        const bucket = kind === 'video' ? 'locket-video' : 'locket-img';
        const objectPath = kind === 'avatar' ? `users/${uid}/public/profile_pic.webp`
            : `users/${uid}/moments/${kind === 'video' ? 'videos' : 'thumbnails'}/${randomUUID().replaceAll('-', '').slice(0, 20)}.${kind === 'video' ? 'mp4' : 'webp'}`;
        const base = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}`;
        const headers: Record<string, string> = { Authorization: `Firebase ${token}`,
            'x-firebase-storage-version': 'ios/12.12.1', 'x-firebase-gmpid': SessionManager.FIREBASE_APP_ID,
            'User-Agent': `${this.client.device.userAgent} (GTMSUF/1)` };
        try {
            let metadata;
            if (kind === 'avatar') {
                metadata = await this.client.http.json(base, { method: 'POST', headers: { ...headers, 'Content-Type': contentType }, body: Buffer.from(bytes) });
            } else {
                const init = await this.client.http.request(`${base}?uploadType=resumable&name=${encodeURIComponent(objectPath)}`, {
                    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json; charset=UTF-8',
                        'x-goog-upload-protocol': 'resumable', 'x-goog-upload-command': 'start',
                        'x-goog-upload-content-type': contentType, 'x-goog-upload-content-length': String(bytes.byteLength) },
                    body: JSON.stringify({ bucket: '', contentType, name: objectPath,
                        metadata: { visibility: 'private', creator: uid }, cacheControl: 'public, max-age=604800' })
                });
                const uploadLocation = init.headers.get('x-goog-upload-url');
                await init.body?.cancel();
                if (!init.ok || !uploadLocation) throw new StorageUploadError(`Upload initialization failed (HTTP ${init.status})`);
                const uploadURL = new URL(uploadLocation);
                if (uploadURL.protocol !== 'https:' || uploadURL.username || uploadURL.password
                    || !(uploadURL.hostname === 'googleapis.com' || uploadURL.hostname.endsWith('.googleapis.com'))) {
                    throw new StorageUploadError('Untrusted storage upload URL');
                }
                metadata = await this.client.http.json(uploadURL, { method: 'PUT', redirect: 'error', headers: {
                    'Content-Type': 'application/octet-stream', 'x-goog-upload-protocol': 'resumable',
                    'x-goog-upload-command': 'upload, finalize', 'x-goog-upload-offset': '0',
                    'x-goog-upload-content-length': String(bytes.byteLength)
                }, body: Buffer.from(bytes) });
            }
            const downloadToken = text(metadata.downloadTokens).split(',')[0];
            if (!downloadToken) throw new StorageUploadError('Storage response is missing a download token');
            return `${base}?alt=media&token=${encodeURIComponent(downloadToken)}`;
        } catch (error) {
            if (error instanceof StorageUploadError) throw error;
            throw new StorageUploadError('Storage upload failed', { cause: error });
        }
    }
}
