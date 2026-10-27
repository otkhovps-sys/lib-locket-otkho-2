import { LocketClient } from '../src/index.js';

export async function createClient(): Promise<LocketClient> {
    const client = new LocketClient({ sessionPath: process.env.LOCKET_SESSION_PATH ?? 'locket_session.json' });
    if (!client.isAuthenticated()) {
        const email = process.env.LOCKET_EMAIL, password = process.env.LOCKET_PASSWORD;
        if (!email || !password) throw new Error('Set LOCKET_EMAIL and LOCKET_PASSWORD, or provide a saved session with LOCKET_SESSION_PATH.');
        await client.login(email, password);
    }
    return client;
}

export function argument(name: string, index = 2): string {
    const value = process.argv[index];
    if (!value) throw new Error(`Missing ${name} argument`);
    return value;
}
