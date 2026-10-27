import { randomBytes } from 'node:crypto';
import type { LocketClient } from '../client.js';
import { dataOf, object, records, text } from '../types.js';
import type { ApiData, MediaInput } from '../types.js';

export class UserModule {
    constructor(private readonly client: LocketClient) {}

    async getProfile(userUid?: string): Promise<ApiData> {
        const profile = dataOf(await this.client.postApi('fetchUserV2', { user_uid: userUid ?? this.client.session.uid }));
        if (!userUid || userUid === this.client.session.uid) {
            try {
                const lookup = await this.client.session.authRequest('lookup', { idToken: await this.client.session.getValidToken() });
                const user = records(lookup.users)[0];
                if (user?.photoUrl) profile.profile_picture_url = user.photoUrl;
                if (user?.email) profile.email = user.email;
            } catch { /* Backend profiles remain usable when the optional Auth lookup fails. */ }
        }
        return profile;
    }

    async getProfileByUsername(username: string): Promise<ApiData> {
        const token = await this.client.friends.resolveInviteTokenFromUsername(username);
        if (!token) throw new Error(`No invite token found for ${username}`);
        const result = await this.client.friends.fetchUserByInviteToken(token);
        return result.user ? object(result.user) : result;
    }

    updateProfile(attributes: ApiData): Promise<ApiData> { return this.client.postApi('changeProfileInfo', attributes); }
    updateName(firstName: string, lastName: string): Promise<ApiData> { return this.updateProfile({ first_name: firstName, last_name: lastName }); }
    updateBirthdate(birthdate: string): Promise<ApiData> {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || !Number.isFinite(Date.parse(birthdate))
            || new Date(birthdate).toISOString().slice(0, 10) !== birthdate) throw new TypeError('birthdate must be a valid YYYY-MM-DD date');
        return this.updateProfile({ birthdate });
    }

    async uploadAvatar(input: MediaInput): Promise<string> {
        await this.client.session.getValidToken();
        return this.client.storage.upload(await this.client.media.toWebp(input), 'avatar', 'image/webp');
    }

    async updateAvatar(input: MediaInput): Promise<ApiData> {
        const url = typeof input === 'string' && /^https?:\/\//i.test(input) ? new URL(input).href : await this.uploadAvatar(input);
        const data = await this.client.session.authRequest('update', { idToken: await this.client.session.getValidToken(), photoUrl: url, returnSecureToken: true });
        const session = this.client.session;
        session.idToken = text(data.idToken, session.idToken ?? '');
        session.refreshToken = text(data.refreshToken, session.refreshToken ?? '');
        const lifetime = Number(data.expiresIn);
        if (Number.isFinite(lifetime) && lifetime > 0) session.expiresAt = Date.now() + lifetime * 1000;
        session.save();
        return { status: 200, profile_picture_url: url, user: data };
    }

    syncClientData(options: { pushNotifications?: boolean; autoSync?: boolean; extraData?: ApiData } = {}): Promise<ApiData> {
        const clientData: ApiData = { push_notifications_enabled: options.pushNotifications ?? true };
        if (options.autoSync !== false) clientData.ios_version = `${this.client.device.appVersion}.${this.client.device.buildNumber}`;
        return this.client.postApi('setClientData', { client_data: { ...clientData, ...options.extraData } });
    }

    setNotificationToken(fcmToken?: string, autoFake = true): Promise<ApiData> {
        const token = fcmToken ?? (autoFake ? `${this.client.device.installationId}:APA91b${randomBytes(105).toString('base64url')}` : '');
        return this.client.postApi('setNotificationToken', { app: 'locket', installation_id: this.client.device.installationId, notification_token: token });
    }
}
