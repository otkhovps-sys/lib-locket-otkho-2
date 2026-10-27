import type { LocketClient } from '../client.js';
import { dataOf, int64, object, required, text } from '../types.js';
import type { ApiData } from '../types.js';

export class FriendsModule {
    constructor(private readonly client: LocketClient) {}

    async getGroupsAndFriends(): Promise<ApiData> { return dataOf(await this.client.postApi('getGroupsState')); }

    private async profiles(collection: string): Promise<ApiData[]> {
        await this.client.session.getValidToken();
        const uid = encodeURIComponent(this.client.session.uid ?? '');
        const docs = await this.client.firestore.list(`users/${uid}/${collection}`);
        const profiles: ApiData[] = [];
        for (const doc of docs) {
            try { profiles.push(await this.client.user.getProfile(doc.id)); }
            catch { profiles.push({ uid: doc.id }); }
        }
        return profiles;
    }

    getAllFriends(): Promise<ApiData[]> { return this.profiles('friends'); }
    async getFriendRequests(): Promise<{ incoming: ApiData[]; outgoing: ApiData[] }> {
        const [incoming, outgoing] = await Promise.all([this.profiles('incoming_friend_requests'), this.profiles('outgoing_friend_requests')]);
        return { incoming, outgoing };
    }

    async resolveInviteTokenFromUsername(username: string): Promise<string | null> {
        const clean = required(username.trim().replace(/^@/, ''), 'username');
        const response = await this.client.http.request(`https://locket.cam/${encodeURIComponent(clean)}`, { headers: { 'User-Agent': this.client.device.userAgent } });
        if (response.status === 404) { await response.body?.cancel(); return null; }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Invite lookup failed (HTTP ${response.status})`); }
        const html = await response.text();
        return /locket\.camera(?:%2F|\/)invites(?:%2F|\/)([a-zA-Z0-9]+)/i.exec(html)?.[1] ?? null;
    }

    async fetchUserByInviteToken(inviteToken: string): Promise<ApiData> {
        return dataOf(await this.client.postApi('fetchUserForInviteToken', { invite_token: required(inviteToken, 'inviteToken') }));
    }

    sendRequest(userUid: string, source = 'inviteCardPopup'): Promise<ApiData> {
        return this.client.postApi('sendFriendRequest', { user_uid: required(userUid, 'userUid'), source, platform: 'iOS',
            create_ofr_for_temp_users: false, share_history_eligible: true, get_reengagement_status: false,
            prompted_reengagement: false, rollcall: false, invite_variant: int64(1002) });
    }

    async sendRequestByUsername(username: string): Promise<ApiData> {
        const profile = await this.client.user.getProfileByUsername(username);
        return this.sendRequest(required(text(profile.uid), 'resolved user UID'));
    }

    async acceptRequest(userUid: string): Promise<ApiData> {
        return dataOf(await this.client.postApi('acceptFriendRequest', { user_uid: required(userUid, 'userUid'), during_signup: false,
            ios_version: `${this.client.device.appVersion}.${this.client.device.buildNumber}` }));
    }

    private async resolveTargetUid(userOrUid: string): Promise<string> {
        const clean = required(userOrUid.trim().replace(/^@/, ''), 'userUid');
        if (!userOrUid.startsWith('@') && /^[A-Za-z0-9]{28}$/.test(clean)) return clean;
        const profile = await this.client.user.getProfileByUsername(clean);
        return required(text(profile.uid), 'resolved user UID');
    }

    async remove(userUid: string): Promise<ApiData> { return this.client.postApi('removeFriend', { user_uid: await this.resolveTargetUid(userUid) }); }
    async block(userUid: string): Promise<ApiData> { return this.client.postApi('blockFriend', { user_uid: await this.resolveTargetUid(userUid) }); }
    async unblock(userUid: string): Promise<ApiData> { return this.client.postApi('unblockUser', { user_uid: await this.resolveTargetUid(userUid) }); }

    async suggestFriends(phoneContacts: unknown[] = []): Promise<ApiData | ApiData[]> {
        const result = await this.client.postApi('suggestFriends', { contacts: phoneContacts, smart_friend_suggestions: int64(0) });
        return Array.isArray(result.data) ? result.data.map(object) : dataOf(result);
    }
}
