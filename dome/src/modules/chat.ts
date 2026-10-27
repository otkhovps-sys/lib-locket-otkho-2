import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import WebSocket from 'ws';
import type { LocketClient } from '../client.js';
import { LocketError } from '../errors.js';
import { readJSON, writeJSON } from '../persistence.js';
import { dataOf, int64, object, records, required, text } from '../types.js';
import type { ApiData } from '../types.js';

export const ReactionEmoji = {
    YELLOW_HEART: '💛', FIRE: '🔥', HEART_EYES: '😍', TWO_HEARTS: '💕', SPARKLE_HEART: '💖',
    SMILING_HEARTS: '🥰', LAUGHING: '😂', KISS: '💋', HEART_HANDS: '🫶', RED_HEART: '❤️',
    DEFAULT_QUICK_REACTIONS: ['💛', '🔥', '😍', '💕'],
    OFFICIAL_PALETTE: ['💛', '💖', '🥰', '😂', '🔥', '💋', '🫶', '❤️', '😍', '💕']
} as const;

export interface MessageInput {
    conversationId: string; senderUid: string; receiverUid?: string | null; text: string;
    messageId?: string | null; clientToken?: string | null; timestamp?: string; reaction?: string | null; reactions?: ApiData[];
}
export interface ChatMessage extends ApiData {
    conversation_id: string; message_id: string | null; client_token: string | null; sender_uid: string;
    receiver_uid: string | null; is_me: boolean; text: string; has_reaction: boolean;
    reaction: string | null; timestamp: string;
}
export interface MessageQuery { conversationId?: string; otherUserId?: string; fetchServer?: boolean }

export class ChatModule {
    readonly ReactionEmoji = ReactionEmoji;
    private readonly memory = new Map<string, Record<string, ChatMessage[]>>();
    constructor(private readonly client: LocketClient) {}
    static getSupportedReactions(): string[] { return [...ReactionEmoji.OFFICIAL_PALETTE]; }
    getSupportedReactions(): string[] { return ChatModule.getSupportedReactions(); }

    private historyPath(): string | null {
        return this.client.session.sessionPath ? join(dirname(this.client.session.sessionPath),
            `chat_history_${encodeURIComponent(this.client.session.uid ?? 'default')}.json`) : null;
    }
    private history(): Record<string, ChatMessage[]> {
        const path = this.historyPath();
        if (!path) return this.memory.get(this.client.session.uid ?? '') ?? {};
        return Object.fromEntries(Object.entries(object(readJSON(path))).map(([id, value]) => [id, records(value).filter(m =>
            typeof m.timestamp === 'string' && typeof m.sender_uid === 'string' && typeof m.text === 'string') as ChatMessage[]]));
    }
    private saveHistory(history: Record<string, ChatMessage[]>): void {
        const path = this.historyPath();
        if (path) writeJSON(path, history);
        else this.memory.set(this.client.session.uid ?? '', history);
    }

    recordMessage(input: MessageInput): ChatMessage {
        required(input.conversationId, 'conversationId');
        const history = this.history();
        const messages = Object.hasOwn(history, input.conversationId) ? history[input.conversationId]! : [];
        const existing = messages.find(m => (input.messageId && m.message_id === input.messageId) || (input.clientToken && m.client_token === input.clientToken));
        const entry: ChatMessage = { ...existing, conversation_id: input.conversationId, message_id: input.messageId ?? existing?.message_id ?? null,
            client_token: input.clientToken ?? existing?.client_token ?? null, sender_uid: input.senderUid, receiver_uid: input.receiverUid ?? null,
            is_me: input.senderUid === this.client.session.uid, text: input.text,
            has_reaction: Boolean(input.reaction || input.reactions?.length), reaction: input.reaction ?? null,
            timestamp: input.timestamp ?? existing?.timestamp ?? new Date().toISOString() };
        if (input.reactions) entry.reactions = input.reactions;
        if (existing) messages[messages.indexOf(existing)] = entry;
        else messages.push(entry);
        messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        Object.defineProperty(history, input.conversationId, { value: messages, enumerable: true, writable: true, configurable: true });
        this.saveHistory(history);
        return entry;
    }

    async fetchMessagesFromServer(query: Omit<MessageQuery, 'fetchServer'> = {}): Promise<ChatMessage[]> {
        await this.client.session.getValidToken();
        let conversationId = query.conversationId;
        if (!conversationId && query.otherUserId) {
            for (const summary of await this.client.firestore.list(`users/${encodeURIComponent(this.client.session.uid!)}/conversations`)) {
                const document = await this.client.firestore.get(`conversations/${encodeURIComponent(summary.id)}`);
                if (Array.isArray(document.fields.members) && document.fields.members.includes(query.otherUserId)) {
                    conversationId = summary.id; break;
                }
            }
        }
        if (!conversationId) return [];
        const messages = await this.client.firestore.list(`conversations/${encodeURIComponent(conversationId)}/messages`);
        const result = messages.map(({ id, fields }) => {
            const reactions = records(fields.reactions), reaction = text(reactions[0]?.emoji) || null;
            return this.recordMessage({ conversationId, messageId: id, senderUid: text(fields.sender), text: text(fields.body),
                receiverUid: query.otherUserId ?? (fields.sender === this.client.session.uid ? null : this.client.session.uid),
                clientToken: text(fields.client_token) || null, timestamp: text(fields.created_at), reaction, reactions });
        });
        return result.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    async getMessages(query: MessageQuery = {}): Promise<ChatMessage[]> {
        if (query.fetchServer !== false) {
            const messages = await this.fetchMessagesFromServer(query);
            if (messages.length) return messages;
        }
        return Object.entries(this.history()).filter(([id]) => !query.conversationId || query.conversationId === id)
            .flatMap(([, messages]) => messages).filter(m => !query.otherUserId || m.sender_uid === query.otherUserId || m.receiver_uid === query.otherUserId)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    async sendMessage(receiverUid: string, message?: string, momentUid?: string): Promise<ApiData> {
        required(receiverUid, 'receiverUid');
        if (!message?.trim() && !momentUid) throw new TypeError('Message text or a moment is required');
        const token = randomUUID().toUpperCase();
        const result = dataOf(await this.client.postApi('sendChatMessageV2', { receiver_uid: receiverUid,
            msg: message || (momentUid ? '\u200b' : ''), moment_uid: momentUid ?? null, from_memory: false, intensity: int64(0), client_token: token }));
        if (typeof result.conversation_uid === 'string') this.recordMessage({ conversationId: result.conversation_uid,
            senderUid: this.client.session.uid!, receiverUid, text: message ?? '', clientToken: token,
            messageId: text(result.message_uid ?? result.msg_id) || null });
        return { ...result, msg_id: result.msg_id ?? token, client_token: token };
    }

    sendMoment(receiverUid: string, momentUid: string, message?: string): Promise<ApiData> {
        return this.sendMessage(receiverUid, message, required(momentUid, 'momentUid'));
    }

    async deleteMessage(conversationUid: string, messageUid: string, validateOwnership = true): Promise<ApiData> {
        const messages = this.history()[conversationUid] ?? [];
        if (validateOwnership && messages.some(m => (m.message_id === messageUid || m.client_token === messageUid) && !m.is_me)) {
            throw new TypeError('You can only recall your own messages');
        }
        const result = await this.client.postApi('deleteChatMessage', { conversation_uid: required(conversationUid, 'conversationUid'), message_uid: required(messageUid, 'messageUid') });
        const history = this.history();
        Object.defineProperty(history, conversationUid, { value: (history[conversationUid] ?? []).filter(m => m.message_id !== messageUid && m.client_token !== messageUid), enumerable: true, writable: true, configurable: true });
        this.saveHistory(history);
        return result;
    }

    async sendReaction(conversationId: string, messageId: string, emoji: string, validateReceiver = true): Promise<ApiData> {
        const messages = this.history()[conversationId] ?? [];
        if (validateReceiver && messages.some(m => (m.message_id === messageId || m.client_token === messageId) && m.is_me)) throw new TypeError('Cannot react to your own message');
        const result = await this.client.postApi('sendChatMessageReaction', { conversation_id: required(conversationId, 'conversationId'),
            message_id: required(messageId, 'messageId'), emoji: required(emoji, 'emoji') });
        const history = this.history();
        for (const message of history[conversationId] ?? []) if (message.message_id === messageId || message.client_token === messageId) {
            message.reaction = emoji; message.has_reaction = true;
        }
        this.saveHistory(history);
        return result;
    }

    async removeReaction(conversationId: string, messageId: string): Promise<ApiData> {
        const result = await this.client.postApi('removeChatMessageReaction', { conversation_id: required(conversationId, 'conversationId'), message_id: required(messageId, 'messageId') });
        const history = this.history();
        for (const message of history[conversationId] ?? []) if (message.message_id === messageId || message.client_token === messageId) {
            message.reaction = null; message.has_reaction = false;
        }
        this.saveHistory(history);
        return result;
    }

    markAsRead(options: { conversationUid?: string; otherUserId?: string; sendReadReceipt?: boolean }): Promise<ApiData> {
        if (!options.conversationUid && !options.otherUserId) throw new TypeError('A conversation or peer UID is required');
        const payload: ApiData = { send_read_receipt: options.sendReadReceipt ?? true };
        if (options.conversationUid) payload.conversation_uid = options.conversationUid;
        if (options.otherUserId) payload.other_user_id = options.otherUserId;
        return this.client.postApi('markAsRead', payload);
    }

    async getConversations(): Promise<ApiData[]> {
        await this.client.session.getValidToken();
        const uid = this.client.session.uid!;
        const conversations = await this.client.firestore.list(`users/${encodeURIComponent(uid)}/conversations`);
        return conversations.map(({ id, fields }) => {
            const members = Array.isArray(fields.members) ? fields.members : [];
            const latest = object(fields.latest_message);
            return { conversation_id: id, peer_uid: members.find(member => member !== uid) ?? null, members,
                unread_count: fields.unread_count ?? 0, is_read: fields.is_read ?? true, other_last_read_at: fields.other_last_read_at ?? null,
                latest_message: { text: latest.body ?? null, sender_uid: latest.sender ?? null, timestamp: latest.created_at ?? null } };
        });
    }

    async listenRealtime(otherUserId: string, onMessage: (message: unknown) => void | Promise<void>, options: { signal?: AbortSignal } = {}): Promise<void> {
        required(otherUserId, 'otherUserId');
        if (options.signal?.aborted) return;
        const token = await this.client.session.getValidToken();
        let peer = otherUserId;
        if (otherUserId.startsWith('@') || (otherUserId.length < 28 && !/[A-Z]/.test(otherUserId))) {
            peer = required(text((await this.client.user.getProfileByUsername(otherUserId)).uid), 'resolved user UID');
        }
        if (options.signal?.aborted) return;
        const url = new URL(this.client.realtimeUrl);
        url.searchParams.set('otherUserId', peer); url.searchParams.set('userId', this.client.session.uid!);
        const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': this.client.device.userAgent,
            'x-ios-bundle-identifier': this.client.device.bundleId }, handshakeTimeout: this.client.http.timeoutMs, maxPayload: 8 * 1024 * 1024 });
        await new Promise<void>((resolve, reject) => {
            let processing = Promise.resolve();
            const abort = () => socket.terminate();
            const heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.ping(); }, 20_000);
            heartbeat.unref();
            options.signal?.addEventListener('abort', abort, { once: true });
            socket.on('message', raw => {
                let data: unknown;
                const value = raw.toString();
                try { data = JSON.parse(value) as unknown; } catch { data = value; }
                processing = processing.then(() => onMessage(data));
                void processing.catch(error => { socket.terminate(); reject(error); });
            });
            socket.once('error', error => { if (!options.signal?.aborted) reject(new LocketError('WebSocket connection failed', { cause: error })); });
            socket.once('close', code => {
                clearInterval(heartbeat); options.signal?.removeEventListener('abort', abort);
                if (!options.signal?.aborted && code !== 1000 && code !== 1005) reject(new LocketError(`WebSocket closed unexpectedly (${code})`));
                else void processing.then(resolve, reject);
            });
            if (options.signal?.aborted) abort();
        });
    }
}
