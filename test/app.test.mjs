import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chunks, fileName, publicAddress, openSource } from '../lib.mjs';

test('chunks preserve bytes, identify final chunk, and bound payloads', async () => {
  for (const length of [0, 1, 7, 8, 9, 16, 17, 100]) {
    const input = Buffer.from(Array.from({ length }, (_, i) => i));
    const output = [];
    for await (const chunk of chunks(Readable.from([input.subarray(0, 3), input.subarray(3)]), 8))
      output.push(chunk);
    assert.deepEqual(Buffer.concat(output.map((c) => c.data)), input);
    assert.equal(output.at(-1).last, true);
    assert.equal(output.filter((c) => c.last).length, 1);
    assert.ok(output.every((c) => c.data.length <= 8));
    assert.ok(output.slice(0, -1).every((c) => c.data.length === 8));
  }
});
test('filenames handle disposition and unsafe separators', () => {
  assert.equal(fileName('https://example.com/a%20b.zip'), 'a b.zip');
  assert.equal(
    fileName('https://example.com/', "attachment; filename*=UTF-8''hello%20world.pdf"),
    'hello world.pdf',
  );
  assert.equal(
    fileName('https://example.com/', 'attachment; filename="../test.zip"'),
    '.._test.zip',
  );
});
test('private addresses and URL schemes are rejected', async () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
  await assert.rejects(openSource('http://127.0.0.1/'), /private/);
  await assert.rejects(openSource('file:///etc/passwd'), /public HTTP/);
});
test('local server serves app and protects mutation endpoints', async () => {
  const port = 33219,
    origin = `http://127.0.0.1:${port}`;
  const directory = await mkdtemp(join(tmpdir(), 'relay-http-test-'));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), RELAY_DATA_DIR: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Server did not start')), 5000).unref(),
      ),
    ]);
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Your Drive/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const state = await (await fetch(`${origin}/api/state`)).json();
    assert.equal(state.connected, false);
    assert.equal((await fetch(`${origin}/api/config`, { method: 'POST', body: '{}' })).status, 403);
    const post = (data) =>
      fetch(`${origin}/api/config`, {
        method: 'POST',
        headers: { Origin: origin, 'X-App-Token': state.csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    assert.equal((await post({ web: { client_id: 'x' } })).status, 400);
    assert.equal(
      (await post({ installed: { client_id: 'test.apps.googleusercontent.com' } })).status,
      200,
    );
    const auth = await (
      await fetch(`${origin}/api/connect`, {
        method: 'POST',
        headers: { Origin: origin, 'X-App-Token': state.csrf },
        body: '{}',
      })
    ).json();
    const authUrl = new URL(auth.url);
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
    assert.equal((await fetch(`${origin}/oauth/callback?state=wrong&code=fake`)).status, 400);
    const invalidHostStatus = await new Promise((resolve, reject) => {
      http
        .get(`${origin}/api/state`, { headers: { Host: 'evil.example' } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', reject);
    });
    assert.equal(invalidHostStatus, 403);
    const request = async (path, data) => {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { Origin: origin, 'X-App-Token': state.csrf },
        body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    };
    const added = await request('/api/transfers', {
      url: 'https://example.com/file.zip',
      tags: ['test'],
    });
    assert.equal(added.status, 202);
    assert.equal(added.body.added.length, 1);
    const id = added.body.added[0];
    assert.equal((await request(`/api/transfers/${id}/pause`, {})).body.status, 'Paused');
    assert.equal((await request(`/api/transfers/${id}/resume`, {})).body.status, 'Queued');
    assert.equal((await request('/api/settings', { concurrency: 99 })).status, 400);
    assert.equal((await request('/api/settings', { concurrency: 2 })).body.settings.concurrency, 2);
    const batch = await request('/api/import', {
      format: 'text',
      text: 'https://example.com/a\nhttps://example.com/b',
      defaults: { tags: ['batch'], priority: 1 },
    });
    assert.equal(batch.body.added.length, 2);
    const after = await (await fetch(`${origin}/api/state`)).json();
    assert.equal(after.jobs.length, 3);
    assert.deepEqual(after.jobs.find((j) => j.id === batch.body.added[0]).tags, ['batch']);
    assert.ok(after.jobs.every((j) => !('url' in j)));
    const csv = await (await fetch(`${origin}/api/export?format=csv`)).text();
    assert.match(csv, /sourceHost/);
    assert.doesNotMatch(csv, /https:\/\/example/);
  } finally {
    child.kill();
    await once(child, 'exit');
    await rm(directory, { recursive: true, force: true });
  }
});
