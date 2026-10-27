import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocketClient } from '../src/index.js';

test('chat history deduplicates by message ID and keeps original server timestamps', async () => {
    const client = new LocketClient({ sessionPath: null });
    client.session.uid = 'self';
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'friend', receiverUid: 'self', text: 'late', messageId: 'late', timestamp: '2026-01-02T00:00:00Z' });
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'friend', receiverUid: 'self', text: 'early', messageId: 'early', timestamp: '2026-01-01T00:00:00Z' });
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'friend', receiverUid: 'self', text: 'edited', messageId: 'late', timestamp: '2026-01-02T00:00:00Z' });
    const history = await client.chat.getMessages({ conversationId: 'conv', fetchServer: false });
    assert.deepEqual(history.map(m => m.text), ['early', 'edited']);
    assert.equal(history[1]?.timestamp, '2026-01-02T00:00:00Z');
    client.session.uid = 'another';
    assert.deepEqual(await client.chat.getMessages({ fetchServer: false }), []);
});

test('chat ownership checks block recalling peer messages and reacting to own messages', async () => {
    const client = new LocketClient({ sessionPath: null });
    client.session.uid = 'self';
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'friend', receiverUid: 'self', text: 'peer', messageId: 'peer' });
    client.chat.recordMessage({ conversationId: 'conv', senderUid: 'self', receiverUid: 'friend', text: 'mine', messageId: 'mine', clientToken: 'mine-token' });
    await assert.rejects(client.chat.deleteMessage('conv', 'peer'), /own messages/);
    await assert.rejects(client.chat.sendReaction('conv', 'mine', '❤️'), /own message/);
    await assert.rejects(client.chat.sendReaction('conv', 'mine-token', '❤️'), /own message/);
});

test('standalone moments use the invisible protocol character and retain client tokens', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async (_url, init) => {
        const data = JSON.parse(String(init?.body)).data;
        assert.equal(data.msg, '\u200b');
        assert.equal(data.moment_uid, 'moment');
        assert.match(data.client_token, /^[0-9A-F-]{36}$/);
        return Response.json({ result: { data: { conversation_uid: 'conv' } } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    const sent = await client.chat.sendMoment('friend', 'moment');
    assert.equal(typeof sent.client_token, 'string');
    assert.equal((await client.chat.getMessages({ conversationId: 'conv', fetchServer: false })).length, 1);
});
