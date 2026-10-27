import { DeviceProfile } from './device.js';
import { AuthenticationError, LocketAPIError } from './errors.js';
import { HttpTransport } from './http.js';
import { readJSON, writeJSON } from './persistence.js';
import { object, required, text } from './types.js';
import type { ApiData, Fetch } from './types.js';

export interface SessionOptions {
    sessionPath?: string | null;
    device?: DeviceProfile;
    fetch?: Fetch;
    timeoutMs?: number;
}

export class SessionManager {
    static readonly FIREBASE_API_KEY = 'AIzaSyCQngaaXQIfJaH0aS2l7REgIjD7nL431So';
    static readonly FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
    static readonly FIREBASE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
    static readonly FIREBASE_APP_ID = '1:641029076083:ios:cc8eb46290d69b234fa606';
    readonly sessionPath: string | null;
    readonly http: HttpTransport;
    device: DeviceProfile;
    uid: string | null = null;
    email: string | null = null;
    idToken: string | null = null;
    refreshToken: string | null = null;
    expiresAt = 0;
    private refreshing: Promise<void> | null = null;

    constructor(options: SessionOptions = {}) {
        this.sessionPath = options.sessionPath === undefined ? 'locket_session.json' : options.sessionPath;
        this.device = options.device ?? new DeviceProfile();
        this.http = new HttpTransport(options.fetch, options.timeoutMs);
        this.load();
    }

    load(): boolean {
        if (!this.sessionPath) return false;
        const data = object(readJSON(this.sessionPath));
        if (typeof data.uid !== 'string' || typeof data.idToken !== 'string' || typeof data.refreshToken !== 'string'
            || typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt)) return false;
        this.uid = data.uid;
        this.email = text(data.email) || null;
        this.idToken = data.idToken;
        this.refreshToken = data.refreshToken;
        this.expiresAt = data.expiresAt;
        if (data.device) this.device = DeviceProfile.fromJSON(data.device);
        return true;
    }

    save(): void {
        if (this.sessionPath) writeJSON(this.sessionPath, { uid: this.uid, email: this.email, idToken: this.idToken,
            refreshToken: this.refreshToken, expiresAt: this.expiresAt, device: this.device.toJSON() });
    }

    async authRequest(operation: string, payload: ApiData): Promise<ApiData> {
        try {
            const data = await this.http.json(`${SessionManager.FIREBASE_AUTH_URL}:${operation}?key=${SessionManager.FIREBASE_API_KEY}`,
                { method: 'POST', headers: this.device.defaultHeaders, body: JSON.stringify(payload) });
            if (data.error) throw new AuthenticationError('Authentication service rejected the request');
            return data;
        } catch (error) {
            if (error instanceof AuthenticationError) throw error;
            if (error instanceof LocketAPIError) throw new AuthenticationError('Authentication request failed', { cause: error });
            throw error;
        }
    }

    async login(email: string, password: string): Promise<ApiData> {
        required(email, 'email'); required(password, 'password');
        const data = await this.authRequest('signInWithPassword', { email, password, returnSecureToken: true });
        this.applyTokens(data, false);
        this.email = text(data.email, email);
        this.save();
        return data;
    }

    private applyTokens(data: ApiData, refresh: boolean): void {
        const id = refresh ? data.id_token : data.idToken;
        const token = refresh ? data.refresh_token : data.refreshToken;
        const uid = refresh ? (data.user_id ?? this.uid) : data.localId;
        const expires = Number(refresh ? data.expires_in : data.expiresIn);
        if (typeof id !== 'string' || !id || typeof token !== 'string' || !token || typeof uid !== 'string' || !uid
            || !Number.isFinite(expires) || expires <= 0) throw new AuthenticationError('Invalid token response');
        this.idToken = id; this.refreshToken = token; this.uid = uid;
        this.expiresAt = Date.now() + expires * 1000;
    }

    async refresh(): Promise<void> {
        if (!this.refreshing) {
            this.refreshing = this.performRefresh().finally(() => { this.refreshing = null; });
        }
        return this.refreshing;
    }

    private async performRefresh(): Promise<void> {
        if (!this.refreshToken) throw new AuthenticationError('No refresh token available');
        try {
            const data = await this.http.json(`${SessionManager.FIREBASE_TOKEN_URL}?key=${SessionManager.FIREBASE_API_KEY}`, {
                method: 'POST', headers: { ...this.device.defaultHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.refreshToken })
            });
            this.applyTokens(data, true);
            this.save();
        } catch (error) {
            if (error instanceof LocketAPIError) throw new AuthenticationError('Token refresh failed', { cause: error });
            throw error;
        }
    }

    async getValidToken(): Promise<string> {
        if (!this.idToken) throw new AuthenticationError('Call login() before making authenticated requests');
        if (Date.now() >= this.expiresAt - 60_000) await this.refresh();
        return this.idToken!;
    }
}
