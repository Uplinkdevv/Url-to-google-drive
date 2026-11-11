import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, defaults, validateSettings } from '../core/store.mjs';
import { TransferQueue, normalizeInput } from '../core/queue.mjs';
import { parseBatch, parseCSV, jobsCSV } from '../core/export.mjs';
import { filterJobs, pageJobs, bytes, duration } from '../public/model.js';
import { renderName, makeWorker } from '../core/transfer.mjs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'relay-test-'));
  const store = new Store(dir);
  let queue;
  try {
    await fn({ dir, store, setQueue: (q) => (queue = q) });
  } finally {
    if (queue) await queue.close();
    await store.writes.catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));
test('settings reject unknown keys, fractional limits and invalid enums', () => {
  assert.throws(() => validateSettings({ concurrency: 1.5 }));
  assert.throws(() => validateSettings({ concurrency: 9 }));
  assert.throws(() => validateSettings({ theme: 'neon' }));
  assert.throws(() => validateSettings({ token: 'secret' }));
  assert.throws(() => validateSettings({ rememberSources: 'true' }));
  assert.equal(validateSettings({ concurrency: 8 }).concurrency, 8);
  assert.deepEqual(validateSettings({ defaultTags: ['a', 'a'] }).defaultTags, ['a']);
});
test('input validation normalizes URLs, schedules and fingerprints', () => {
  const input = normalizeInput(
    {
      url: 'https://example.com/file.zip#fragment',
      scheduledAt: '2099-01-01T00:00:00Z',
      priority: 1,
      tags: ['a', 'a'],
    },
    defaults,
  );
  assert.equal(input.url, 'https://example.com/file.zip');
  assert.equal(input.name, 'file.zip');
  assert.deepEqual(input.tags, ['a']);
  assert.ok(input.scheduledAt);
  assert.throws(() => normalizeInput({ url: 'https://user:pass@example.com/' }, defaults));
  assert.throws(() =>
    normalizeInput({ url: 'https://example.com', expectedSha256: 'nope' }, defaults),
  );
  assert.throws(() => normalizeInput({ url: 'https://example.com', allowHtml: 'false' }, defaults));
});
test('batch imports handle BOM-free text comments, quoted CSV and JSON', () => {
  assert.deepEqual(
    parseBatch('# note\nhttps://example.com/a\n\n').map((r) => r.url),
    ['https://example.com/a'],
  );
  assert.deepEqual(parseCSV('url,name\r\n"https://example.com/a","a,b"'), [
    ['url', 'name'],
    ['https://example.com/a', 'a,b'],
  ]);
  assert.equal(
    parseBatch('url,name,tags\nhttps://example.com/a,"A, B",a;b', 'csv')[0].name,
    'A, B',
  );
  assert.equal(parseBatch('["https://example.com/a"]', 'json')[0].url, 'https://example.com/a');
  assert.throws(() => parseBatch('name\nfile', 'csv'));
  assert.throws(() => parseCSV('"broken'));
  assert.throws(() => parseBatch('{}', 'json'));
});
test('CSV exports neutralize formula cells and quote embedded punctuation', () => {
  const csv = jobsCSV([{ name: '=HYPERLINK("x")', notes: 'a,b\nnext' }]);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"a,b\nnext"'));
});
test('atomic workspace saves serialize and preserve corrupt originals', () =>
  fixture(async ({ store, dir }) => {
    await store.load();
    store.data.settings.concurrency = 1;
    const first = store.save();
    store.data.settings.concurrency = 2;
    await store.save();
    await first;
    assert.equal(
      JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).settings.concurrency,
      2,
    );
    await writeFile(join(dir, 'state.json'), 'broken');
    await assert.rejects(new Store(dir).load(), /preserved/);
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), 'broken');
  }));
test('queue validates entire batch before adding and detects duplicates', () =>
  fixture(async ({ store, setQueue }) => {
    const q = new TransferQueue(store, async () => ({}));
    setQueue(q);
    await q.init();
    assert.throws(() => q.add([{ url: 'https://example.com/a' }, { url: 'invalid' }]));
    assert.equal(q.jobs.size, 0);
    const result = q.add([{ url: 'https://example.com/a' }, { url: 'https://example.com/a' }]);
    assert.equal(result.added.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(q.add([{ url: 'https://example.com/a', folder: 'different' }]).added.length, 1);
  }));
test('queue respects connection, global pause, schedule, priority and concurrency', () =>
  fixture(async ({ store, setQueue }) => {
    let connected = false,
      now = 1000;
    const started = [],
      resolve = [];
    const q = new TransferQueue(
      store,
      async (job) => {
        started.push(job.name);
        await new Promise((r) => resolve.push(r));
        return { uploaded: 10, total: 10 };
      },
      { connected: () => connected, now: () => now },
    );
    setQueue(q);
    await q.init();
    store.data.settings.concurrency = 1;
    q.add([
      { url: 'https://example.com/low', priority: -1 },
      { url: 'https://example.com/high', priority: 1 },
      { url: 'https://example.com/future', scheduledAt: new Date(100000).toISOString() },
    ]);
    q.pump();
    await tick();
    assert.equal(started.length, 0);
    connected = true;
    store.data.settings.queuePaused = true;
    q.pump();
    await tick();
    assert.equal(started.length, 0);
    store.data.settings.queuePaused = false;
    q.pump();
    await tick();
    assert.deepEqual(started, ['high']);
    resolve.shift()();
    await tick();
    assert.deepEqual(started, ['high', 'low']);
    resolve.shift()();
    await tick();
    assert.equal(started.length, 2);
    now = 100001;
    q.pump();
    await tick();
    assert.equal(started[2], 'future');
    resolve.shift()();
    await tick();
    assert.equal(q.stats().completed, 3);
  }));
test('pause/resume/retry/archive/pin and active deletion restrictions work', () =>
  fixture(async ({ store, setQueue }) => {
    let fail = true;
    const q = new TransferQueue(
      store,
      async () => {
        if (fail) throw new Error('source failed');
        return { uploaded: 1, total: 1 };
      },
      { connected: () => true },
    );
    setQueue(q);
    await q.init();
    const id = q.add([{ url: 'https://example.com/a' }]).added[0];
    q.action(id, 'pause');
    q.pump();
    await tick();
    assert.equal(q.jobs.get(id).status, 'Paused');
    q.action(id, 'resume');
    q.pump();
    assert.throws(() => q.action(id, 'remove'));
    await tick();
    assert.equal(q.jobs.get(id).status, 'Failed');
    fail = false;
    q.action(id, 'retry');
    q.pump();
    await tick();
    assert.equal(q.jobs.get(id).status, 'Complete');
    q.action(id, 'pin');
    q.action(id, 'archive');
    assert.equal(q.jobs.get(id).pinned, true);
    assert.equal(q.jobs.get(id).archived, true);
    assert.throws(() => q.action(id, 'retry'));
  }));
test('saved history redacts URLs by default and restores opted-in queued sources', () =>
  fixture(async ({ store, dir, setQueue }) => {
    const q = new TransferQueue(store, async () => ({}));
    setQueue(q);
    await q.init();
    const id = q.add([{ url: 'https://example.com/a?token=PRIVATE' }]).added[0];
    await q.persist();
    assert.ok(!(await readFile(join(dir, 'state.json'), 'utf8')).includes('PRIVATE'));
    store.data.settings.rememberSources = true;
    await q.persist();
    const reload = new TransferQueue(new Store(dir), async () => ({}));
    await reload.init();
    assert.equal(reload.sources.get(id), 'https://example.com/a?token=PRIVATE');
    await reload.close();
    store.data.settings.rememberSources = false;
    await q.persist();
    const restart = new TransferQueue(new Store(dir), async () => ({}));
    await restart.init();
    assert.equal(restart.jobs.get(id).status, 'Interrupted');
    await restart.close();
  }));
test('filters search notes and tags, sort and paginate without mutation', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    name: `file${i}`,
    tags: i === 5 ? ['special'] : [],
    notes: '',
    sourceHost: 'example.com',
    status: i % 2 ? 'Complete' : 'Queued',
    created: i,
    pinned: false,
    archived: false,
    total: i,
    priority: 0,
  }));
  assert.equal(filterJobs(jobs, { search: 'special' })[0].id, '5');
  assert.equal(filterJobs(jobs, { status: 'Complete' }).length, 15);
  assert.equal(filterJobs(jobs, { sort: 'size' })[0].id, '29');
  assert.equal(pageJobs(jobs, 99).page, 2);
  assert.equal(pageJobs(jobs, 2).items.length, 5);
  assert.equal(jobs[0].id, '0');
  assert.equal(bytes(1024), '1.0 KB');
  assert.equal(duration(65), '1m 5s');
});
test('naming patterns preserve extensions and clean path separators', () => {
  assert.equal(
    renderName('{date}/{base}{ext}', 'report.pdf', 'example.com', new Date('2026-11-11T12:34:56Z')),
    '2026-11-11_report.pdf',
  );
});

function mockWorker(
  data,
  {
    mime = 'application/octet-stream',
    length = data.length,
    failFirst = false,
    expectedMd5 = true,
  } = {},
) {
  const calls = [],
    updates = [];
  let failed = false;
  const google = async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === 'POST')
      return new Response('', { headers: { location: 'https://www.googleapis.com/upload/mock' } });
    if (failFirst && !failed) {
      failed = true;
      throw new Error('Connection interrupted');
    }
    if (options.headers['Content-Range'].startsWith('bytes */') && data.length !== 0)
      return new Response(null, { status: 308 });
    return new Response(
      JSON.stringify({
        id: 'mock-file',
        md5Checksum: expectedMd5 ? createHash('md5').update(data).digest('hex') : undefined,
      }),
      { status: 200 },
    );
  };
  const source = async () => {
    const response = Readable.from([data]);
    response.headers = {
      'content-type': mime,
      ...(length === undefined ? {} : { 'content-length': String(length) }),
    };
    return { response, url: new URL('https://example.com/file.bin') };
  };
  const worker = makeWorker({ google, accessToken: async () => 'fake', source });
  return {
    calls,
    updates,
    run: (job) =>
      worker(
        { url: 'https://example.com/file.bin', sourceHost: 'example.com', folder: 'root', ...job },
        new AbortController().signal,
        (patch) => updates.push(patch),
        { ...defaults, chunkMB: 1 },
      ),
  };
}
test('upload worker streams bytes, records checksums and verifies Google response', async () => {
  const data = Buffer.from('payload'),
    mock = mockWorker(data);
  const result = await mock.run({});
  assert.equal(result.uploaded, 7);
  assert.equal(result.sha256, createHash('sha256').update(data).digest('hex'));
  assert.equal(result.verified, true);
  assert.equal(mock.calls[1].headers['Content-Range'], 'bytes 0-6/7');
  assert.deepEqual(mock.calls[1].body, data);
});
test('upload worker supports zero-byte files', async () => {
  const mock = mockWorker(Buffer.alloc(0));
  const result = await mock.run({});
  assert.equal(result.uploaded, 0);
  assert.equal(mock.calls[1].headers['Content-Range'], 'bytes */0');
});
test('upload worker rejects HTML, size limits and wrong SHA before final upload', async () => {
  await assert.rejects(mockWorker(Buffer.from('html'), { mime: 'text/html' }).run({}), /web page/);
  await assert.rejects(mockWorker(Buffer.from('a')).run({ maxFileMB: 0.0000001 }), /limit/);
  const mock = mockWorker(Buffer.from('wrong'));
  await assert.rejects(mock.run({ expectedSha256: '0'.repeat(64) }), /SHA-256/);
  assert.equal(mock.calls.length, 1);
});
test('upload worker probes failed requests before retrying', async () => {
  const mock = mockWorker(Buffer.from('payload'), { failFirst: true });
  const result = await mock.run({});
  assert.equal(result.uploaded, 7);
  assert.ok(mock.calls.some((call) => call.headers['Content-Range'] === 'bytes */7'));
  assert.ok(mock.updates.some((patch) => patch.status === 'Retrying'));
});
