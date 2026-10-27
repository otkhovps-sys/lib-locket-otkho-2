export type ApiData = Record<string, unknown>;
export type Fetch = typeof globalThis.fetch;
export type MediaInput = string | Uint8Array;
export type ProgressCallback = (percent: number, status: string) => void;

export function object(value: unknown): ApiData {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ApiData : {};
}

export function records(value: unknown): ApiData[] {
    return Array.isArray(value) ? value.filter(v => v !== null && typeof v === 'object' && !Array.isArray(v)) as ApiData[] : [];
}

export function dataOf(value: ApiData): ApiData {
    return value.data !== undefined ? object(value.data) : value;
}

export function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

export function int64(value: number | string): ApiData {
    return { '@type': 'type.googleapis.com/google.protobuf.Int64Value', value: String(value) };
}

export function required(value: string, name: string): string {
    if (!value.trim()) throw new TypeError(`${name} is required`);
    return value;
}

export function validLimit(limit?: number): void {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new RangeError('limit must be a positive integer');
}
