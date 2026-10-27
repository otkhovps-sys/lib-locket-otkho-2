import type { SessionManager } from './session.js';
import { object, records, text } from './types.js';
import type { ApiData } from './types.js';
import { LocketAPIError } from './errors.js';

export interface FirestoreDocument { id: string; fields: ApiData }

export function decodeValue(value: unknown): unknown {
    const field = object(value);
    if ('stringValue' in field) return field.stringValue;
    if ('timestampValue' in field) return field.timestampValue;
    if ('booleanValue' in field) return field.booleanValue;
    if ('integerValue' in field) return Number(field.integerValue);
    if ('doubleValue' in field) return Number(field.doubleValue);
    if ('nullValue' in field) return null;
    if ('arrayValue' in field) {
        const values = object(field.arrayValue).values;
        return Array.isArray(values) ? values.map(decodeValue) : [];
    }
    if ('mapValue' in field) return decodeFields(object(field.mapValue).fields);
    return undefined;
}

function decodeFields(fields: unknown): ApiData {
    return Object.fromEntries(Object.entries(object(fields)).map(([key, value]) => [key, decodeValue(value)]));
}

export class FirestoreClient {
    static readonly BASE = 'https://firestore.googleapis.com/v1/projects/locket-4252a/databases/(default)/documents';
    constructor(private readonly session: SessionManager) {}

    private async request(path: string, pageToken?: string): Promise<ApiData> {
        const url = new URL(`${FirestoreClient.BASE}/${path}`);
        if (pageToken !== undefined) {
            url.searchParams.set('pageSize', '200');
            if (pageToken) url.searchParams.set('pageToken', pageToken);
        }
        return this.session.http.json(url, { headers: { Authorization: `Bearer ${await this.session.getValidToken()}` } });
    }

    async get(path: string): Promise<FirestoreDocument> {
        const doc = await this.request(path);
        return { id: text(doc.name).split('/').pop() ?? '', fields: decodeFields(doc.fields) };
    }

    async list(path: string): Promise<FirestoreDocument[]> {
        const documents: FirestoreDocument[] = [];
        const seen = new Set<string>();
        let page = '';
        do {
            const result = await this.request(path, page);
            for (const doc of records(result.documents)) {
                documents.push({ id: text(doc.name).split('/').pop() ?? '', fields: decodeFields(doc.fields) });
            }
            page = text(result.nextPageToken);
            if (page && seen.has(page)) throw new LocketAPIError('Firestore returned a repeated page token');
            seen.add(page);
        } while (page);
        return documents;
    }
}
