import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import presetsJSON from '../caption-presets.json' with { type: 'json' };
import type { LocketClient } from '../client.js';
import type { FirestoreDocument } from '../firestore.js';
import { LocketAPIError, StorageUploadError } from '../errors.js';
import { VIDEO_SIZE_LIMIT } from '../media.js';
import type { VideoOptions } from '../media.js';
import { NoteType } from '../note-types.js';
import { readJSON, writeJSON } from '../persistence.js';
import { dataOf, int64, object, records, required, text, validLimit } from '../types.js';
import type { ApiData, MediaInput } from '../types.js';

export interface OverlayOptions { text?: string; noteType?: string; icon?: string; colors?: string[]; textColor?: string }
export interface Overlay extends ApiData { overlay_type: string; overlay_id: string; alt_text: string; data: ApiData }
export interface UploadVideoOptions extends VideoOptions { autoCompress?: boolean; contentType?: string }
export interface PostOptions extends OverlayOptions, UploadVideoOptions {
    image?: MediaInput; video?: MediaInput; caption?: string; isPrivate?: boolean; recipients?: string[];
}
export interface MyMomentsOptions { limit?: number; startDate?: string; endDate?: string }

const presets: Record<string, ApiData> = presetsJSON;

function storedMedia(input: MediaInput, bucket: string): boolean {
    if (typeof input !== 'string') return false;
    try {
        const url = new URL(input);
        return url.protocol === 'https:' && !url.username && !url.password
            && url.hostname === 'firebasestorage.googleapis.com' && url.pathname.startsWith(`/v0/b/${bucket}/o/`)
            && url.searchParams.get('alt') === 'media';
    } catch { return false; }
}

function parseDate(value: string | undefined, endOfDay = false): number | undefined {
    if (value === undefined) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const timestamp = Date.parse(dateOnly ? value + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00Z') : value);
    if (!Number.isFinite(timestamp) || (dateOnly && new Date(timestamp).toISOString().slice(0, 10) !== value)) throw new TypeError('Invalid date filter');
    return timestamp;
}

export class MomentsModule {
    private readonly memory = new Map<string, ApiData[]>();
    constructor(private readonly client: LocketClient) {}

    private historyPath(): string | null {
        return this.client.session.sessionPath ? join(dirname(this.client.session.sessionPath),
            `my_moments_${encodeURIComponent(this.client.session.uid ?? 'default')}.json`) : null;
    }
    private history(): ApiData[] {
        const path = this.historyPath();
        return path ? records(readJSON(path)) : this.memory.get(this.client.session.uid ?? '') ?? [];
    }
    private saveHistory(history: ApiData[]): void {
        const path = this.historyPath();
        if (path) writeJSON(path, history);
        else this.memory.set(this.client.session.uid ?? '', history);
    }

    recordPostedMoment(moment: ApiData): void {
        const id = moment.canonical_uid ?? moment.moment_uid ?? moment.id;
        if (typeof id !== 'string' || !id) return;
        this.saveHistory([moment, ...this.history().filter(m => (m.canonical_uid ?? m.moment_uid ?? m.id) !== id)]);
    }

    extractThumbnail(input: MediaInput, timestampSec = 1): Promise<Buffer> { return this.client.media.extractThumbnail(input, timestampSec); }
    optimizeVideo(input: MediaInput, options: VideoOptions = {}): Promise<Buffer> { return this.client.media.optimizeVideo(input, options); }
    async uploadImage(input: MediaInput): Promise<string> {
        await this.client.session.getValidToken();
        return this.client.storage.upload(await this.client.media.toWebp(input), 'image', 'image/webp');
    }

    async uploadVideo(input: MediaInput, options: UploadVideoOptions = {}): Promise<string> {
        let bytes = await this.client.media.read(input);
        if (bytes.length >= VIDEO_SIZE_LIMIT) {
            if (options.autoCompress === false) throw new StorageUploadError('Video must be smaller than 6,291,456 bytes');
            bytes = await this.optimizeVideo(bytes, options);
        }
        if (bytes.length >= VIDEO_SIZE_LIMIT) throw new StorageUploadError('Compressed video exceeds the size limit');
        return this.client.storage.upload(bytes, 'video', options.contentType ?? 'video/mp4');
    }

    buildOverlay(options: OverlayOptions = {}): Overlay {
        const noteType = options.noteType ?? NoteType.STANDARD;
        const preset = presets[noteType.replace(/^caption:/, '')];
        const finalText = options.text || text(preset?.text);
        const icon = options.icon || text(preset?.icon);
        const colors = options.colors ?? (Array.isArray(preset?.colors) ? preset.colors : []);
        let overlayId = `caption:${noteType}`, dataType = noteType;
        if (noteType === NoteType.STANDARD) { overlayId = 'caption:standard'; dataType = 'standard'; }
        else if (preset?.overlay_id) { overlayId = text(preset.overlay_id); dataType = text(preset.type, 'static_content'); }
        else if (noteType.startsWith('caption:')) { overlayId = noteType; dataType = noteType.split(':').pop() ?? noteType; }
        const data: ApiData = { text: finalText, type: dataType, text_color: options.textColor ?? text(preset?.text_color, '#FFFFFFE6'),
            max_lines: int64(preset || ['static_content', 'streak', 'time', 'review'].includes(dataType) ? 1 : 4),
            background: { material_blur: colors.length ? 'regular' : 'ultra_thin', colors } };
        if (icon) data.icon = { data: icon, type: 'emoji' };
        return { overlay_type: 'caption', overlay_id: overlayId, alt_text: icon ? `${icon} ${finalText}` : finalText, data };
    }

    async post(options: PostOptions): Promise<ApiData> {
        if (!options.image && !options.video) throw new TypeError('An image or video is required');
        if (options.isPrivate && options.recipients?.length) throw new TypeError('Private posts cannot specify recipients');
        await this.client.session.getValidToken();
        const image = options.image ?? await this.extractThumbnail(options.video!);
        const thumbnailUrl = storedMedia(image, 'locket-img') ? String(image) : await this.uploadImage(image);
        const videoUrl = options.video ? storedMedia(options.video, 'locket-video') ? String(options.video) : await this.uploadVideo(options.video, options) : null;
        let caption = options.caption ?? options.text ?? '';
        const overlays: Overlay[] = [];
        if (caption || (options.noteType && options.noteType !== NoteType.STANDARD) || options.colors?.length || options.icon) {
            const overlay = this.buildOverlay({ ...options, text: caption });
            overlays.push(overlay);
            caption ||= overlay.alt_text;
        }
        const payload: ApiData = { thumbnail_url: thumbnailUrl, overlays, sent_to_self_only: options.isPrivate ?? false,
            sent_to_all: !options.isPrivate && !options.recipients?.length, recipients: options.recipients ?? [],
            md5: `${randomUUID().replaceAll('-', '')}_${Math.floor(Date.now() / 1000)}` };
        if (videoUrl) payload.video_url = videoUrl;
        const result = dataOf(await this.client.postApi('postMomentV2', payload));
        if (!result.id && result.canonical_uid) result.id = result.canonical_uid;
        this.recordPostedMoment({ moment_uid: result.canonical_uid ?? result.id, canonical_uid: result.canonical_uid ?? result.id,
            thumbnail_url: thumbnailUrl, video_url: videoUrl, caption, created_at: new Date().toISOString() });
        return result;
    }

    async getLatest(): Promise<ApiData[]> {
        return records((await this.client.postApi('getLatestMomentV2', { should_count_missed_moments: true })).data);
    }

    async getSharedMomentsByUsername(username: string, limit?: number): Promise<ApiData[]> {
        validLimit(limit);
        const profile = await this.client.user.getProfileByUsername(username);
        return this.getSharedMomentsByUser(required(text(profile.uid), 'resolved user UID'), limit);
    }

    async getSharedMomentsByUser(userUid: string, limit?: number): Promise<ApiData[]> {
        required(userUid, 'userUid'); validLimit(limit);
        const friends = await this.client.friends.getAllFriends();
        const excludedUsers = friends.map(f => text(f.uid)).filter(uid => uid && uid !== userUid);
        const found: ApiData[] = [], seen = new Set<string>();
        let sync: string | undefined;
        while (true) {
            const payload: ApiData = { should_count_missed_moments: true, include_group_moments: true, excluded_users: excludedUsers };
            if (sync) payload.sync_token = sync;
            const response = await this.client.postApi('getLatestMomentV2', payload);
            const feed = records(response.data);
            let newCount = 0;
            for (const moment of feed) {
                const id = text(moment.canonical_uid);
                if (!id || seen.has(id)) continue;
                seen.add(id); sync = id; newCount++;
                if (moment.user === userUid) {
                    const seconds = object(moment.date)._seconds;
                    found.push({ moment_uid: id, user_uid: userUid, thumbnail_url: moment.thumbnail_url,
                        image_url: moment.image_url ?? moment.thumbnail_url, video_url: moment.video_url ?? null,
                        caption: moment.caption ?? '', overlays: moment.overlays ?? [], created_at: seconds === undefined ? '' : String(seconds),
                        date: moment.date ?? {}, md5: moment.md5, source: 'feed' });
                    if (limit && found.length >= limit) return found;
                }
            }
            if (!newCount || response.status === 304) return found;
        }
    }

    getPostsByUsername(username: string, limit?: number): Promise<ApiData[]> { return this.getSharedMomentsByUsername(username, limit); }
    getPostsByUser(userUid: string, limit?: number): Promise<ApiData[]> { return this.getSharedMomentsByUser(userUid, limit); }
    async getFilters(): Promise<ApiData> { return dataOf(await this.client.postApi('getFilters')); }
    markAsViewed(momentUid: string): Promise<ApiData> { return this.client.postApi('markMomentAsViewed', { moment_uid: required(momentUid, 'momentUid') }); }
    react(momentUid: string, reaction = '❤️', fromMemory = false): Promise<ApiData> {
        return this.client.postApi('reactToMoment', { moment_uid: required(momentUid, 'momentUid'), reaction: required(reaction, 'reaction'), from_memory: fromMemory, intensity: int64(0) });
    }

    async getRollcallPosts(options: { weekOfYear?: number; year?: number; source?: string } = {}): Promise<ApiData> {
        const now = new Date(), day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
        const isoYear = day.getUTCFullYear();
        const isoWeek = Math.ceil(((day.getTime() - Date.UTC(isoYear, 0, 1)) / 86400_000 + 1) / 7);
        const week = options.weekOfYear ?? isoWeek, year = options.year ?? isoYear;
        if (!Number.isInteger(week) || week < 1 || week > 53 || !Number.isInteger(year) || year < 1) throw new RangeError('Invalid ISO week or year');
        return dataOf(await this.client.postApi('getRollcallPosts', { week_of_year: int64(week), year: int64(year), source: options.source ?? 'banner' }));
    }

    private async optionalDocuments(path: string): Promise<FirestoreDocument[]> {
        try { return await this.client.firestore.list(path); }
        catch (error) {
            if (error instanceof LocketAPIError && [403, 404].includes(error.statusCode ?? 0)) return [];
            throw error;
        }
    }

    async getViews(momentUid: string): Promise<ApiData> {
        const views = dataOf(await this.client.postApi('getMomentViews', { moment_uid: required(momentUid, 'momentUid') }));
        const reactions = await this.optionalDocuments(`moments/${encodeURIComponent(momentUid)}/reactions`);
        return { ...views, reactions: reactions.map(doc => ({ emoji: doc.fields.string ?? '', sender: doc.fields.user ?? '', created_at: doc.fields.created_at ?? '' })) };
    }

    async getAllMyMoments(options: MyMomentsOptions = {}): Promise<ApiData[]> {
        validLimit(options.limit);
        const start = parseDate(options.startDate), end = parseDate(options.endDate, true);
        if (start !== undefined && end !== undefined && start > end) throw new RangeError('startDate must precede endDate');
        await this.client.session.getValidToken();
        const found: ApiData[] = [], seen = new Set<string>();
        const add = async (entry: ApiData): Promise<void> => {
            const id = text(entry.moment_uid ?? entry.canonical_uid ?? entry.id);
            if (!id || seen.has(id)) return;
            const created = text(entry.created_at);
            const stamp = /^\d+(\.\d+)?$/.test(created) ? Number(created) * 1000 : Date.parse(created);
            if ((start !== undefined || end !== undefined) && (!Number.isFinite(stamp)
                || (start !== undefined && stamp < start) || (end !== undefined && stamp > end))) return;
            const views = await this.getViews(id);
            seen.add(id);
            found.push({ moment_uid: id, thumbnail_url: entry.thumbnail_url, video_url: entry.video_url ?? null,
                caption: entry.caption ?? '', views_count: views.count ?? 0, viewers: views.moment_views ?? [],
                reactions: views.reactions ?? [], created_at: created, source: 'posted_moment' });
        };
        for (const entry of this.history()) {
            await add(entry);
            if (options.limit && found.length >= options.limit) return found;
        }
        const uid = this.client.session.uid!;
        const conversations = await this.optionalDocuments(`users/${encodeURIComponent(uid)}/conversations`);
        for (const conversation of conversations) {
            const messages = await this.optionalDocuments(`conversations/${encodeURIComponent(conversation.id)}/messages`);
            for (const message of messages) {
                const thumbnail = text(message.fields.thumbnail_url);
                if (!storedMedia(thumbnail, 'locket-img')) continue;
                const path = decodeURIComponent(new URL(thumbnail).pathname);
                if (!path.startsWith(`/v0/b/locket-img/o/users/${uid}/moments/`)) continue;
                await add({ moment_uid: message.fields.reply_moment ?? message.id, thumbnail_url: thumbnail,
                    created_at: message.fields.created_at });
                if (options.limit && found.length >= options.limit) return found;
            }
        }
        return found;
    }

    async comment(momentUid: string, receiverUid: string, message: string, fromMemory = false): Promise<ApiData> {
        return dataOf(await this.client.postApi('sendChatMessageV2', { moment_uid: required(momentUid, 'momentUid'),
            receiver_uid: required(receiverUid, 'receiverUid'), msg: required(message, 'text'), from_memory: fromMemory, client_token: null }));
    }

    async delete(momentUid: string): Promise<ApiData> {
        const result = await this.client.postApi('deleteMomentV2', { moment_uid: required(momentUid, 'momentUid'), canonical_uid: momentUid });
        this.saveHistory(this.history().filter(m => (m.canonical_uid ?? m.moment_uid ?? m.id) !== momentUid));
        return result;
    }
}
