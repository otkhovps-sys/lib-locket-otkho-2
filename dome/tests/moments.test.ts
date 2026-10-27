import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocketClient, LocketAPIError, NoteType, VIDEO_SIZE_LIMIT, StorageUploadError } from '../src/index.js';
import { object } from '../src/types.js';

const thumbnail = 'https://firebasestorage.googleapis.com/v0/b/locket-img/o/users%2Fself%2Fmoments%2Fthumbnails%2Fphoto.webp?alt=media&token=download';

test('caption presets retain icons, gradient colors, and explicit overrides', () => {
    const client = new LocketClient({ sessionPath: null });
    const overlay = client.moments.buildOverlay({ noteType: NoteType.PARTY_TIME });
    assert.equal(overlay.overlay_id, 'caption:party_time');
    assert.match(overlay.alt_text, /Party Time/);
    assert.ok(Array.isArray(object(object(overlay.data).background).colors));
    const custom = client.moments.buildOverlay({ noteType: NoteType.PARTY_TIME, text: 'Custom', colors: [], textColor: '#000000', icon: '⭐' });
    assert.equal(custom.alt_text, '⭐ Custom');
    assert.deepEqual(object(custom.data).text_color, '#000000');
    assert.deepEqual(object(object(custom.data).background).colors, []);
    assert.equal(NoteType.DOI_ROI, 'custom_4281443912454362723');
});

test('posting private moments retains recipients flags and records only successful posts', async () => {
    let fail = false;
    const client = new LocketClient({ sessionPath: null, fetch: async (_url, init) => {
        const data = JSON.parse(String(init?.body)).data;
        assert.equal(data.thumbnail_url, thumbnail);
        assert.equal(data.sent_to_self_only, true);
        assert.equal(data.sent_to_all, false);
        return Response.json({ result: fail ? { error: 'denied' } : { data: { canonical_uid: 'moment' } } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    assert.equal((await client.moments.post({ image: thumbnail, isPrivate: true })).id, 'moment');
    fail = true;
    await assert.rejects(client.moments.post({ image: thumbnail, isPrivate: true }), LocketAPIError);
});

test('feed pagination stops on duplicate pages, filters users, and respects limits', async () => {
    let requests = 0;
    const client = new LocketClient({ sessionPath: null, fetch: async (url) => {
        if (String(url).includes('firestore')) return Response.json({ documents: [] });
        requests++;
        return Response.json({ result: { data: [{ canonical_uid: 'one', user: 'friend', thumbnail_url: thumbnail, date: { _seconds: 1 } },
            { canonical_uid: 'two', user: 'other' }] } });
    } });
    client.session.uid = 'self'; client.session.idToken = 'valid'; client.session.expiresAt = Date.now() + 3600_000;
    assert.equal((await client.moments.getPostsByUser('friend')).length, 1);
    assert.equal(requests, 2);
    assert.equal((await client.moments.getPostsByUser('friend', 1)).length, 1);
    assert.equal(requests, 3);
});

test('oversized videos are rejected before any upload when compression is disabled', async () => {
    const client = new LocketClient({ sessionPath: null, fetch: async () => { throw new Error('Must not upload'); } });
    await assert.rejects(client.moments.uploadVideo(Buffer.alloc(VIDEO_SIZE_LIMIT), { autoCompress: false }), StorageUploadError);
});

test('empty posts and invalid date filters fail before making requests', async () => {
    const client = new LocketClient({ sessionPath: null });
    await assert.rejects(client.moments.post({}), TypeError);
    await assert.rejects(client.moments.getAllMyMoments({ startDate: 'invalid' }), TypeError);
});
