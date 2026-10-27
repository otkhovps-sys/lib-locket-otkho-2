import { LocketAPIError } from './errors.js';
import { object } from './types.js';
import type { ApiData, Fetch } from './types.js';

export class HttpTransport {
    constructor(private readonly fetcher: Fetch = globalThis.fetch, readonly timeoutMs = 30_000) {
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');
    }

    request(url: string | URL, init: RequestInit = {}): Promise<Response> {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        return this.fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    }

    async json(url: string | URL, init: RequestInit = {}): Promise<ApiData> {
        const response = await this.request(url, init);
        if (response.status === 304) return { status: 304, data: [] };
        let body: unknown;
        try { body = await response.json(); }
        catch { throw new LocketAPIError(`Invalid JSON response (HTTP ${response.status})`, response.status); }
        if (!response.ok) throw new LocketAPIError(`Request failed (HTTP ${response.status})`, response.status, body);
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            throw new LocketAPIError('Expected a JSON object', response.status);
        }
        return object(body);
    }
}
