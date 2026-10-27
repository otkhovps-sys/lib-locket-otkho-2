import { DeviceProfile } from './device.js';
import type { DeviceOptions } from './device.js';
import { SessionManager } from './session.js';
import type { SessionOptions } from './session.js';
import { LocketAPIError } from './errors.js';
import { FirestoreClient } from './firestore.js';
import { MediaProcessor } from './media.js';
import type { MediaOptions } from './media.js';
import { StorageClient } from './storage.js';
import { UserModule } from './modules/user.js';
import { FriendsModule } from './modules/friends.js';
import { MomentsModule } from './modules/moments.js';
import { ChatModule } from './modules/chat.js';
import { object } from './types.js';
import type { ApiData } from './types.js';

export interface ClientOptions extends SessionOptions, MediaOptions { deviceOptions?: DeviceOptions; realtimeUrl?: string }

export class LocketClient {
    static readonly API_BASE = 'https://api.locketcamera.com';
    readonly session: SessionManager;
    readonly firestore: FirestoreClient;
    readonly media: MediaProcessor;
    readonly storage: StorageClient;
    readonly user: UserModule;
    readonly friends: FriendsModule;
    readonly moments: MomentsModule;
    readonly chat: ChatModule;
    readonly realtimeUrl: string;

    constructor(options: ClientOptions = {}) {
        this.session = new SessionManager({ ...options, device: options.device ?? new DeviceProfile(options.deviceOptions) });
        this.firestore = new FirestoreClient(this.session);
        this.media = new MediaProcessor(this.http, options);
        this.storage = new StorageClient(this);
        this.user = new UserModule(this);
        this.friends = new FriendsModule(this);
        this.moments = new MomentsModule(this);
        this.chat = new ChatModule(this);
        this.realtimeUrl = options.realtimeUrl ?? 'wss://api.locketcamera.com/wss_v2/chat';
    }

    get device(): DeviceProfile { return this.session.device; }
    get http() { return this.session.http; }

    setDevice(options: DeviceOptions = {}): void {
        if (options.autoEmulate === true || Object.keys(options).length === 0) this.device.enableAutoEmulation();
        else this.device.setCustomDevice(options);
        this.session.save();
    }

    isAuthenticated(): boolean { return Boolean(this.session.idToken && this.session.uid); }
    login(email: string, password: string): Promise<ApiData> { return this.session.login(email, password); }

    async postApi(endpoint: string, payload: ApiData = {}): Promise<ApiData> {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(endpoint)) throw new TypeError('Invalid API endpoint');
        const response = await this.http.json(`${LocketClient.API_BASE}/${endpoint}`, {
            method: 'POST', headers: { ...this.device.defaultHeaders, Authorization: `Bearer ${await this.session.getValidToken()}`,
                'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ data: { ...payload, analytics: this.device.analyticsData } })
        });
        const result = 'result' in response ? object(response.result) : response;
        const status = Number(result.status);
        if (result.error || result.errors || (Number.isFinite(status) && status >= 400)) {
            throw new LocketAPIError(`Locket API rejected ${endpoint}`, Number.isFinite(status) ? status : undefined, result);
        }
        return result;
    }
}
