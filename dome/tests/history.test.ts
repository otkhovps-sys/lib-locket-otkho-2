import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LocketClient, LocketAPIError } from '../src/index.js';

test('own moment date filters include the full UTC end date and enrich views/reactions', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async (url) => {
        if (String(url).includes('/reactions')) return Response.json({ documents: [{ name: 'moments/yes/reactions/r', fields: {
            string: { stringValue: '❤️' }, user: { stringValue: 'friend' }, created_at: { timestampValue: '2026-02-01T12:00:00Z' }
        } }] });
        if (String(url).includes('firestore')) return Response.json({ documents: [] });
        return Response.json({ result: { data: { count: 2, moment_views: [{ user: 'friend' }] } } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    client.moments.recordPostedMoment({ canonical_uid: 'old', created_at: '2026-01-31T23:59:59Z' });
    client.moments.recordPostedMoment({ canonical_uid: 'yes', created_at: '2026-02-01T23:59:59.999Z', caption: 'hello' });
    client.moments.recordPostedMoment({ canonical_uid: 'new', created_at: '2026-02-02T00:00:00Z' });
    const posts = await client.moments.getAllMyMoments({ startDate: '2026-02-01', endDate: '2026-02-01' });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.moment_uid, 'yes');
    assert.equal(posts[0]?.views_count, 2);
    assert.deepEqual(posts[0]?.reactions, [{ emoji: '❤️', sender: 'friend', created_at: '2026-02-01T12:00:00Z' }]);
});

test('Firestore chat decoding retains nested reactions and timestamps across disk reloads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'locket-history-test-'));
    try {
        const path = join(dir, 'session.json');
        const client = new LocketClient({ sessionPath: path, fetch: async () => Response.json({ documents: [{ name: 'conversations/c/messages/m', fields: {
            sender: { stringValue: 'friend' }, body: { stringValue: 'hello' }, created_at: { timestampValue: '2026-01-01T00:00:00Z' },
            reactions: { arrayValue: { values: [{ mapValue: { fields: { sender: { stringValue: 'self' }, emoji: { stringValue: '🔥' } } } }] } }
        } }] }) });
        client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
        const fetched = await client.chat.getMessages({ conversationId: 'c' });
        assert.equal(fetched[0]?.reaction, '🔥');
        const restored = new LocketClient({ sessionPath: path });
        restored.session.uid = 'self';
        const cached = await restored.chat.getMessages({ conversationId: 'c', fetchServer: false });
        assert.deepEqual(cached, fetched);
        assert.equal(cached[0]?.timestamp, '2026-01-01T00:00:00Z');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('repeated Firestore page tokens fail explicitly instead of looping forever', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async () => Response.json({ documents: [], nextPageToken: 'same' }) });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await assert.rejects(client.friends.getAllFriends(), /repeated page token/);
});

test('HTTP failures and malformed JSON never become valid profiles', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async () => new Response('<html>failure</html>', { status: 502 }) });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await assert.rejects(client.user.getProfile('friend'), LocketAPIError);
});

test('raw Firebase UIDs with only letters bypass username resolution', async () => {
    let requested = '';
    const uid = 'a'.repeat(28);
    const client = new LocketClient({ sessionPath: null, fetch: async url => {
        requested = String(url); return Response.json({ result: { status: 200 } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await client.friends.block(uid);
    assert.ok(requested.endsWith('/blockFriend'));
});
