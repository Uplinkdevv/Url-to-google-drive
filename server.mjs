import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { Store, defaults, validateSettings } from './core/store.mjs';
import { TransferQueue, terminalStatuses, normalizeInput } from './core/queue.mjs';
import { makeWorker } from './core/transfer.mjs';
import { jobsCSV, parseBatch } from './core/export.mjs';

const port = Number(process.env.PORT || 3210),
  origin = `http://127.0.0.1:${port}`;
const csrf = randomBytes(32).toString('hex');
let config = null,
  tokens = null,
  pendingAuth = null,
  refreshPromise = null;
const store = new Store(resolve(process.env.RELAY_DATA_DIR || '.relay'));
async function google(url, options = {}) {
  const timeout = AbortSignal.timeout(60000);
  const response = await fetch(url, {
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok && response.status !== 308) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(
      body.error?.message || body.error_description || `Google returned HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }
  return response;
}
async function accessToken() {
  if (!tokens) throw new Error('Connect Google Drive first.');
  if (Date.now() > tokens.expiresAt - 60000) {
    if (!tokens.refresh_token) throw new Error('Your sign-in expired. Connect Google Drive again.');
    if (!refreshPromise)
      refreshPromise = (async () => {
        const response = await google('https://oauth2.googleapis.com/token', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: config.client_id,
            client_secret: config.client_secret || '',
            refresh_token: tokens.refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        const fresh = await response.json();
        tokens = { ...tokens, ...fresh, expiresAt: Date.now() + fresh.expires_in * 1000 };
      })().finally(() => {
        refreshPromise = null;
      });
    await refreshPromise;
  }
  return tokens.access_token;
}
async function drive(path, options = {}) {
  return google(`https://www.googleapis.com/drive/v3/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...options.headers },
  });
}
const queue = new TransferQueue(store, makeWorker({ google, accessToken }), {
  connected: () => !!tokens,
});
await queue.init();
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  const buffers = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Request exceeds 2 MB.');
    buffers.push(chunk);
  }
  return JSON.parse(Buffer.concat(buffers).toString('utf8') || '{}');
}
function attachment(res, type, name, text) {
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return json(res, 403, { error: 'Invalid host.' });
    const url = new URL(req.url, origin);
    if (!['GET', 'POST'].includes(req.method))
      return json(res, 405, { error: 'Method not allowed.' });
    if (
      req.method === 'POST' &&
      (req.headers['x-app-token'] !== csrf || req.headers.origin !== origin)
    )
      return json(res, 403, { error: 'Reload the app and try again.' });
    if (req.method === 'GET' && url.pathname === '/oauth/callback') {
      const state = Buffer.from(url.searchParams.get('state') || ''),
        expected = Buffer.from(pendingAuth?.state || '');
      if (
        !pendingAuth ||
        Date.now() - pendingAuth.created > 600000 ||
        state.length !== expected.length ||
        !timingSafeEqual(state, expected)
      )
        throw new Error('Invalid or expired sign-in. Try again.');
      const auth = pendingAuth;
      pendingAuth = null;
      if (url.searchParams.has('error'))
        throw new Error('Google sign-in was declined. Return to Relay to reconnect.');
      const result = await google('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          code: url.searchParams.get('code') || '',
          client_id: config.client_id,
          client_secret: config.client_secret || '',
          redirect_uri: `${origin}/oauth/callback`,
          grant_type: 'authorization_code',
          code_verifier: auth.verifier,
        }),
      });
      tokens = await result.json();
      tokens.expiresAt = Date.now() + tokens.expires_in * 1000;
      queue.event('connection', 'Google Drive connected');
      queue.pump();
      res.writeHead(302, { Location: '/' });
      return res.end();
    }
    if (req.method === 'GET') {
      if (url.pathname === '/api/state')
        return json(res, 200, {
          version: '2.0.0-dev',
          csrf,
          configured: !!config,
          connected: !!tokens,
          jobs: queue.snapshot(),
          settings: store.data.settings,
          templates: store.data.templates,
          events: store.data.events,
          stats: queue.stats(),
          savingError: queue.savingError,
        });
      if (url.pathname === '/api/health')
        return json(res, 200, {
          ok: !queue.savingError,
          version: '2.0.0-dev',
          uptime: Math.floor(process.uptime()),
          connected: !!tokens,
          active: queue.controllers.size,
        });
      if (url.pathname === '/api/features')
        return json(
          res,
          200,
          JSON.parse(await readFile(new URL('./docs/features.json', import.meta.url), 'utf8')),
        );
      if (url.pathname === '/api/export') {
        const jobs = queue.snapshot();
        if (url.searchParams.get('format') === 'csv')
          return attachment(res, 'text/csv; charset=utf-8', 'relay-transfers.csv', jobsCSV(jobs));
        return attachment(
          res,
          'application/json',
          'relay-transfers.json',
          JSON.stringify(
            { version: 2, exportedAt: new Date().toISOString(), transfers: jobs },
            null,
            2,
          ),
        );
      }
      if (url.pathname === '/api/backup')
        return attachment(
          res,
          'application/json',
          'relay-workspace.json',
          JSON.stringify(
            {
              version: 2,
              settings: store.data.settings,
              templates: store.data.templates,
              jobs: queue.snapshot(),
              events: store.data.events,
            },
            null,
            2,
          ),
        );
      if (url.pathname === '/api/folders') {
        const folders = [];
        let page = '';
        do {
          const query = new URLSearchParams({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'nextPageToken,files(id,name,parents,starred)',
            pageSize: '1000',
            ...(page ? { pageToken: page } : {}),
          });
          const result = await (await drive(`files?${query}`)).json();
          folders.push(...result.files);
          page = result.nextPageToken;
        } while (page);
        return json(res, 200, { folders });
      }
      if (url.pathname === '/api/account')
        return json(
          res,
          200,
          await (await drive('about?fields=user(displayName,emailAddress),storageQuota')).json(),
        );
    }
    if (req.method === 'POST') {
      const data = await body(req);
      if (url.pathname === '/api/config') {
        if (tokens || queue.controllers.size)
          throw new Error('Disconnect before changing the Google client.');
        const client = data.installed;
        if (
          typeof client?.client_id !== 'string' ||
          !client.client_id.endsWith('.apps.googleusercontent.com')
        )
          throw new Error('Choose a Google OAuth client JSON of type Desktop app.');
        config = { client_id: client.client_id, client_secret: client.client_secret || '' };
        pendingAuth = null;
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/connect') {
        if (!config) throw new Error('Add your Google OAuth client JSON first.');
        pendingAuth = {
          state: randomBytes(32).toString('hex'),
          verifier: randomBytes(32).toString('base64url'),
          created: Date.now(),
        };
        const query = new URLSearchParams({
          client_id: config.client_id,
          redirect_uri: `${origin}/oauth/callback`,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/drive.file',
          state: pendingAuth.state,
          code_challenge: createHash('sha256').update(pendingAuth.verifier).digest('base64url'),
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt: 'consent',
        });
        return json(res, 200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
      }
      if (url.pathname === '/api/disconnect') {
        if (queue.controllers.size)
          throw new Error('Cancel active transfers before disconnecting.');
        tokens = null;
        pendingAuth = null;
        queue.event('connection', 'Google Drive disconnected');
        await queue.persist();
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/settings') {
        store.data.settings = validateSettings(data, store.data.settings);
        queue.prune();
        await queue.persist();
        queue.pump();
        return json(res, 200, { settings: store.data.settings });
      }
      if (url.pathname === '/api/settings/reset') {
        store.data.settings = { ...defaults };
        await queue.persist();
        return json(res, 200, { settings: store.data.settings });
      }
      if (url.pathname === '/api/transfers' || url.pathname === '/api/import') {
        const inputs =
          url.pathname === '/api/import'
            ? parseBatch(data.text, data.format).map((row) => ({
                ...data.defaults,
                ...Object.fromEntries(
                  Object.entries(row).filter(([, value]) => value !== undefined && value !== ''),
                ),
              }))
            : Array.isArray(data.transfers)
              ? data.transfers
              : [data];
        const result = queue.add(inputs);
        await queue.persist();
        queue.pump();
        return json(res, 202, result);
      }
      if (url.pathname === '/api/bulk') {
        if (!Array.isArray(data.ids) || data.ids.length > 1000)
          throw new Error('Select up to 1,000 transfers.');
        const results = data.ids.map((id) => {
          try {
            queue.action(id, data.action, data.data);
            return { id, ok: true };
          } catch (error) {
            return { id, ok: false, error: error.message };
          }
        });
        await queue.persist();
        queue.pump();
        return json(res, 200, { results });
      }
      const action = url.pathname.match(
        /^\/api\/transfers\/([a-f0-9]+)\/(cancel|pause|resume|retry|remove|edit|pin|archive)$/,
      );
      if (action) {
        const result = queue.action(action[1], action[2], data);
        await queue.persist();
        queue.pump();
        return json(res, 200, result);
      }
      if (url.pathname === '/api/history/clear') {
        let removed = 0;
        for (const job of queue.snapshot())
          if (
            terminalStatuses.includes(job.status) &&
            !job.pinned &&
            !queue.controllers.has(job.id)
          ) {
            queue.action(job.id, 'remove');
            removed++;
          }
        await queue.persist();
        return json(res, 200, { removed });
      }
      if (url.pathname === '/api/templates') {
        const name = String(data.name || '')
          .trim()
          .slice(0, 80);
        if (!name) throw new Error('Enter a template name.');
        const fields = {};
        for (const key of ['folder', 'priority', 'allowHtml', 'tags', 'notes', 'nameTemplate'])
          if (data.fields?.[key] !== undefined) fields[key] = data.fields[key];
        normalizeInput({ ...fields, url: 'https://example.com/file' }, store.data.settings);
        const existing = store.data.templates.find((t) => t.id === data.id);
        if (existing) Object.assign(existing, { name, fields, updated: Date.now() });
        else {
          if (store.data.templates.length >= 100) throw new Error('Template limit reached.');
          store.data.templates.push({
            id: randomBytes(8).toString('hex'),
            name,
            fields,
            created: Date.now(),
          });
        }
        await queue.persist();
        return json(res, 200, { templates: store.data.templates });
      }
      if (url.pathname === '/api/templates/remove') {
        store.data.templates = store.data.templates.filter((t) => t.id !== data.id);
        await queue.persist();
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/folders') {
        const name = String(data.name || '')
          .trim()
          .slice(0, 240);
        if (!name) throw new Error('Enter a folder name.');
        return json(
          res,
          200,
          await (
            await drive('files?fields=id,name,parents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [String(data.parent || 'root')],
              }),
            })
          ).json(),
        );
      }
    }
    const staticFiles = {
      '/': ['index.html', 'text/html'],
      '/app.js': ['app.js', 'text/javascript'],
      '/style.css': ['style.css', 'text/css'],
      '/model.js': ['model.js', 'text/javascript'],
    };
    if (req.method === 'GET' && staticFiles[url.pathname]) {
      const [file, type] = staticFiles[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      return res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    json(res, error.status === 401 ? 401 : 400, { error: error.message });
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(
    `Relay is ready at ${origin}\nWorkspace: ${store.directory}\nCredentials stay in memory only.`,
  );
  if (process.argv.includes('--open')) {
    if (process.platform === 'win32')
      spawn('cmd', ['/c', 'start', '', origin], { windowsHide: true });
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [origin], { stdio: 'ignore' });
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
  clearInterval(queue.timer);
});
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, async () => {
    server.close();
    await queue.close();
    process.exit(0);
  });
