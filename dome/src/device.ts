import { randomInt, randomUUID } from 'node:crypto';
import { object, text } from './types.js';
import type { ApiData } from './types.js';

export interface DeviceOptions {
    autoEmulate?: boolean;
    installationId?: string;
    bundleId?: string;
    appVersion?: string;
    buildNumber?: string;
    hardwareModel?: string;
    modelName?: string;
    iosVersion?: string;
    customUserAgent?: string | null;
    customAnalytics?: ApiData | null;
    appcheckToken?: string | null;
    instanceIdToken?: string | null;
}

export class DeviceProfile {
    static readonly PRESET_MODELS = [
        { model: 'iPhone14,2', name: 'iPhone 13 Pro', hw: 'hw/iPhone14_2', ios: '17.4.1' },
        { model: 'iPhone14,5', name: 'iPhone 13', hw: 'hw/iPhone14_5', ios: '17.5.1' },
        { model: 'iPhone15,2', name: 'iPhone 14 Pro', hw: 'hw/iPhone15_2', ios: '17.6.1' },
        { model: 'iPhone15,3', name: 'iPhone 14 Pro Max', hw: 'hw/iPhone15_3', ios: '18.0.1' },
        { model: 'iPhone16,1', name: 'iPhone 15 Pro', hw: 'hw/iPhone16_1', ios: '18.1.0' }
    ] as const;

    autoEmulate: boolean;
    installationId: string;
    bundleId: string;
    appVersion: string;
    buildNumber: string;
    modelInfo: { model: string; name: string; hw: string; ios: string };
    customUserAgent: string | null;
    customAnalytics: ApiData | null;
    appcheckToken: string | null;
    instanceIdToken: string | null;

    constructor(options: DeviceOptions = {}) {
        const preset = DeviceProfile.PRESET_MODELS[randomInt(DeviceProfile.PRESET_MODELS.length)]!;
        this.autoEmulate = options.autoEmulate ?? true;
        this.installationId = options.installationId ?? randomUUID().replaceAll('-', '').slice(0, 22);
        this.bundleId = options.bundleId ?? 'com.locket.Locket';
        this.appVersion = options.appVersion ?? '2.68.0';
        this.buildNumber = options.buildNumber ?? '2523';
        this.modelInfo = { ...preset };
        if (options.hardwareModel) {
            this.modelInfo.model = options.hardwareModel;
            this.modelInfo.hw = options.hardwareModel.startsWith('hw/') ? options.hardwareModel : `hw/${options.hardwareModel}`;
        }
        this.modelInfo.name = options.modelName ?? preset.name;
        this.modelInfo.ios = options.iosVersion ?? preset.ios;
        this.customUserAgent = options.customUserAgent ?? null;
        this.customAnalytics = options.customAnalytics ?? null;
        this.appcheckToken = options.appcheckToken ?? null;
        this.instanceIdToken = options.instanceIdToken ?? null;
    }

    get userAgent(): string {
        return !this.autoEmulate && this.customUserAgent ? this.customUserAgent
            : `${this.bundleId}/${this.appVersion} iPhone/${this.modelInfo.ios} ${this.modelInfo.hw}`;
    }

    get analyticsData(): ApiData {
        if (!this.autoEmulate && this.customAnalytics) return this.customAnalytics;
        const flag = (value: string) => ({ '@type': 'type.googleapis.com/google.protobuf.Int64Value', value });
        return { ios_version: `${this.appVersion}.${this.buildNumber}`, experiments: {
            flag_18: flag('1203'), flag_7: flag('800'), flag_10: flag('505')
        }, installation_id: this.installationId, platform: 'ios' };
    }

    get defaultHeaders(): Record<string, string> {
        const headers: Record<string, string> = { 'User-Agent': this.userAgent, 'Content-Type': 'application/json',
            Accept: '*/*', 'x-ios-bundle-identifier': this.bundleId };
        if (this.appcheckToken) headers['X-Firebase-AppCheck'] = this.appcheckToken;
        if (this.instanceIdToken) headers['Firebase-Instance-Id-Token'] = this.instanceIdToken;
        return headers;
    }

    setCustomDevice(options: Omit<DeviceOptions, 'autoEmulate'>): void {
        const next = new DeviceProfile({ ...this.options(), ...options, autoEmulate: false });
        if (options.hardwareModel === undefined) next.modelInfo.hw = this.modelInfo.hw;
        Object.assign(this, next);
    }

    enableAutoEmulation(): void {
        this.autoEmulate = true;
        this.customUserAgent = null;
        this.customAnalytics = null;
    }

    private options(): DeviceOptions {
        return { autoEmulate: this.autoEmulate, installationId: this.installationId, bundleId: this.bundleId,
            appVersion: this.appVersion, buildNumber: this.buildNumber, hardwareModel: this.modelInfo.model,
            modelName: this.modelInfo.name, iosVersion: this.modelInfo.ios, customUserAgent: this.customUserAgent,
            customAnalytics: this.customAnalytics, appcheckToken: this.appcheckToken, instanceIdToken: this.instanceIdToken };
    }

    toJSON(): ApiData {
        return { auto_emulate: this.autoEmulate, installation_id: this.installationId, bundle_id: this.bundleId,
            app_version: this.appVersion, build_number: this.buildNumber, model_info: this.modelInfo,
            custom_user_agent: this.customUserAgent, custom_analytics: this.customAnalytics,
            appcheck_token: this.appcheckToken, instance_id_token: this.instanceIdToken };
    }

    static fromJSON(value: unknown): DeviceProfile {
        const data = object(value), model = object(data.model_info);
        const device = new DeviceProfile({ autoEmulate: typeof data.auto_emulate === 'boolean' ? data.auto_emulate : true,
            installationId: text(data.installation_id) || undefined, bundleId: text(data.bundle_id) || undefined,
            appVersion: text(data.app_version) || undefined, buildNumber: text(data.build_number) || undefined,
            hardwareModel: text(model.model) || undefined, modelName: text(model.name) || undefined,
            iosVersion: text(model.ios) || undefined, customUserAgent: text(data.custom_user_agent) || null,
            customAnalytics: data.custom_analytics ? object(data.custom_analytics) : null,
            appcheckToken: text(data.appcheck_token) || null, instanceIdToken: text(data.instance_id_token) || null });
        if (typeof model.hw === 'string') device.modelInfo.hw = model.hw;
        return device;
    }
}
