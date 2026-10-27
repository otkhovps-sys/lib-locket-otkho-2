import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocketClient, LocketAPIError, AuthenticationError } from '../src/index.js';

test('authenticated requests preserve the Firebase envelope and analytics', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async (url, init) => {
        assert.equal(String(url), 'https://api.locketcamera.com/changeProfileInfo');
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer valid');
        const payload = JSON.parse(String(init?.body));
        assert.equal(payload.data.first_name, 'First');
        assert.equal(payload.data.analytics.platform, 'ios');
        return Response.json({ result: { data: { changed: true }, status: 200 } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    assert.deepEqual(await client.user.updateName('First', 'Last'), { data: { changed: true }, status: 200 });
});

test('API errors are never returned as successful data', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async () => Response.json({ result: { status: 403, errors: ['denied'] } }) });
    await assert.rejects(client.postApi('anything'), AuthenticationError);
    client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await assert.rejects(client.postApi('anything'), LocketAPIError);
});

test('self profiles are enriched with Firebase Auth email and avatar', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async url => String(url).includes(':lookup')
        ? Response.json({ users: [{ email: 'a@example.com', photoUrl: 'https://example.com/avatar.webp' }] })
        : Response.json({ result: { data: { uid: 'self', first_name: 'A' } } }) });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    assert.deepEqual(await client.user.getProfile(), { uid: 'self', first_name: 'A', email: 'a@example.com', profile_picture_url: 'https://example.com/avatar.webp' });
});

test('Firestore friend lists follow pagination and resolve every profile', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async (url, init) => {
        const address = String(url);
        if (address.includes('/friends')) return Response.json(address.includes('pageToken=next')
            ? { documents: [{ name: 'users/self/friends/b' }] }
            : { documents: [{ name: 'users/self/friends/a' }], nextPageToken: 'next' });
        const uid = JSON.parse(String(init?.body)).data.user_uid;
        return Response.json({ result: { data: { uid } } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    assert.deepEqual(await client.friends.getAllFriends(), [{ uid: 'a' }, { uid: 'b' }]);
});

test('friend requests preserve protocol flags and resolve encoded invite links', async () => {
    const calls: { endpoint: string; data: Record<string, unknown> }[] = [];
    const client = new LocketClient({ sessionPath: null, fetch: async (url, init) => {
        if (String(url).startsWith('https://locket.cam/')) return new Response('locket.camera%2Finvites%2Fabc123');
        const endpoint = String(url).split('/').pop()!;
        const data = JSON.parse(String(init?.body)).data;
        calls.push({ endpoint, data });
        return Response.json({ result: endpoint === 'fetchUserForInviteToken' ? { data: { user: { uid: 'target' } } } : { status: 200 } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    await client.friends.sendRequestByUsername('@friend');
    const request = calls.find(call => call.endpoint === 'sendFriendRequest')!;
    assert.equal(request.data.user_uid, 'target');
    assert.equal(request.data.share_history_eligible, true);
    assert.equal(request.data.create_ofr_for_temp_users, false);
});
