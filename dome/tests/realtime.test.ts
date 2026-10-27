import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { LocketClient } from '../src/index.js';

test('real WebSocket connections send auth headers and await callbacks in message order', { timeout: 10_000 }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    try {
        const port = (server.address() as AddressInfo).port;
        const client = new LocketClient({ sessionPath: null, realtimeUrl: `ws://127.0.0.1:${port}/chat` });
        client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
        let authorization = '', peer: string | null = null;
        server.on('connection', (socket, request) => {
            authorization = request.headers.authorization ?? '';
            peer = new URL(request.url!, 'http://localhost').searchParams.get('otherUserId');
            socket.send(JSON.stringify({ text: 'first' }));
            socket.send('non-json');
            socket.close(1000);
        });
        const events: unknown[] = [];
        await client.chat.listenRealtime('PeerUID', async message => {
            await new Promise(resolve => setTimeout(resolve, 5));
            events.push(message);
        });
        assert.equal(authorization, 'Bearer valid');
        assert.equal(peer, 'PeerUID');
        assert.deepEqual(events, [{ text: 'first' }, 'non-json']);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('a realtime listener can be aborted without leaving an open socket', { timeout: 10_000 }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    try {
        const port = (server.address() as AddressInfo).port;
        const client = new LocketClient({ sessionPath: null, realtimeUrl: `ws://127.0.0.1:${port}/chat` });
        client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
        const controller = new AbortController();
        server.on('connection', () => controller.abort());
        await client.chat.listenRealtime('PeerUID', () => {}, { signal: controller.signal });
    } finally { for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('callback failures reject the realtime listener and close its socket', { timeout: 10_000 }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    try {
        const client = new LocketClient({ sessionPath: null, realtimeUrl: `ws://127.0.0.1:${(server.address() as AddressInfo).port}/chat` });
        client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
        server.on('connection', socket => socket.send('{}'));
        await assert.rejects(client.chat.listenRealtime('PeerUID', () => { throw new Error('callback failed'); }), /callback failed/);
    } finally { for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
