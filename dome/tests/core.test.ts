import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DeviceProfile } from '../src/device.js';
import { SessionManager } from '../src/session.js';
import { AuthenticationError } from '../src/errors.js';

test('device profiles preserve custom headers and survive serialization', () => {
    const device = new DeviceProfile({ autoEmulate: false, customUserAgent: 'custom-device',
        installationId: 'installation', appcheckToken: 'app-check', instanceIdToken: 'instance' });
    const restored = DeviceProfile.fromJSON(device.toJSON());
    assert.equal(restored.userAgent, 'custom-device');
    assert.equal(restored.analyticsData.platform, 'ios');
    assert.equal(restored.defaultHeaders['X-Firebase-AppCheck'], 'app-check');
    assert.equal(restored.installationId, 'installation');
    restored.enableAutoEmulation();
    assert.match(restored.userAgent, /com\.locket\.Locket/);
});

test('login persists tokens and restores the same device from a Python-compatible session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'locket-test-'));
    try {
        const path = join(dir, 'session.json');
        const fetchMock: typeof fetch = async (_url, init) => {
            assert.equal(JSON.parse(String(init?.body)).email, 'test@example.com');
            return Response.json({ localId: 'user', email: 'test@example.com', idToken: 'id', refreshToken: 'refresh', expiresIn: '3600' });
        };
        const session = new SessionManager({ sessionPath: path, fetch: fetchMock });
        await session.login('test@example.com', 'password');
        assert.equal(JSON.parse(readFileSync(path, 'utf8')).idToken, 'id');
        const restored = new SessionManager({ sessionPath: path, fetch: fetchMock });
        assert.equal(await restored.getValidToken(), 'id');
        assert.equal(restored.device.installationId, session.device.installationId);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('concurrent callers share one refresh request and failed auth raises a typed error', async () => {
    let requests = 0;
    const session = new SessionManager({ sessionPath: null, fetch: async () => {
        requests++;
        await new Promise(resolve => setTimeout(resolve, 5));
        return Response.json({ id_token: 'fresh', refresh_token: 'next', expires_in: '3600', user_id: 'u' });
    } });
    session.idToken = 'expired'; session.refreshToken = 'old'; session.uid = 'u'; session.expiresAt = 0;
    assert.deepEqual(await Promise.all([session.getValidToken(), session.getValidToken()]), ['fresh', 'fresh']);
    assert.equal(requests, 1);
    const invalid = new SessionManager({ sessionPath: null, fetch: async () => Response.json({ error: { message: 'INVALID_PASSWORD' } }, { status: 400 }) });
    await assert.rejects(invalid.login('test@example.com', 'bad'), AuthenticationError);
    assert.equal(invalid.idToken, null);
});

test('malformed session data never authenticates or overwrites the corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'locket-test-'));
    try {
        const path = join(dir, 'session.json');
        writeFileSync(path, '{broken');
        const session = new SessionManager({ sessionPath: path });
        assert.equal(session.idToken, null);
        assert.equal(readFileSync(path, 'utf8'), '{broken');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
