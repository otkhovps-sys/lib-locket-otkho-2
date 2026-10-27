import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocketClient } from '../src/index.js';
import { DeviceProfile } from '../src/device.js';

test('changing an unrelated custom device field preserves its hardware identifier', () => {
    const device = new DeviceProfile();
    const hardware = device.modelInfo.hw;
    device.setCustomDevice({ appVersion: '3.0.0' });
    assert.equal(device.modelInfo.hw, hardware);
});

test('in-flight chat mutations never erase newly recorded messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'locket-race-test-'));
    try {
    let complete: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => { complete = resolve; });
    const client = new LocketClient({ sessionPath: join(dir, 'session.json'), fetch: async () => {
        await waiting;
        return Response.json({ result: { status: 200 } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'self', text: 'old', messageId: 'old' });
    const deletion = client.chat.deleteMessage('conv', 'old');
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'friend', text: 'new', messageId: 'new' });
    complete!();
    await deletion;
    const history = await client.chat.getMessages({ fetchServer: false });
    assert.deepEqual(history.map(message => message.message_id), ['new']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the current user identity is established before constructing Firestore paths', async () => {
    const addresses: string[] = [];
    const client = new LocketClient({ sessionPath: null, fetch: async url => {
        addresses.push(String(url));
        if (String(url).includes('securetoken')) return Response.json({ id_token: 'new', refresh_token: 'next', user_id: 'self', expires_in: '3600' });
        return Response.json({ documents: [] });
    } });
    client.session.idToken = 'expired'; client.session.refreshToken = 'refresh';
    await client.friends.getAllFriends();
    assert.ok(addresses.some(address => address.includes('/users/self/friends')));
});
