import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { openSource, fileName, chunks } from '../lib.mjs';

export function renderName(template, name, host, date = new Date()) {
  if (!template) return name;
  const dot = name.lastIndexOf('.'),
    base = dot > 0 ? name.slice(0, dot) : name,
    ext = dot > 0 ? name.slice(dot) : '';
  return (
    template
      .replace(
        /\{(name|base|ext|host|date|time)\}/g,
        (_, key) =>
          ({
            name,
            base,
            ext,
            host,
            date: date.toISOString().slice(0, 10),
            time: date.toISOString().slice(11, 19).replaceAll(':', '-'),
          })[key],
      )
      .replace(/[\\/\x00-\x1f]/g, '_')
      .slice(0, 240) || name
  );
}

export function makeWorker({ google, accessToken, source = openSource }) {
  return async (job, signal, update, settings) => {
    let response;
    try {
      const opened = await source(job.url, signal);
      response = opened.response;
      const originalName = job.customName
        ? job.name
        : fileName(opened.url.href, response.headers['content-disposition']);
      const name = renderName(job.nameTemplate, originalName, job.sourceHost);
      const mime = (response.headers['content-type'] || 'application/octet-stream').split(';')[0];
      if (mime === 'text/html' && !job.allowHtml)
        throw new Error(
          'This link returns a web page. Use a direct file URL, or allow HTML files.',
        );
      const length = Number(response.headers['content-length']);
      let total = Number.isSafeInteger(length) && length >= 0 ? length : null;
      const maxBytes = (job.maxFileMB || 0) * 1024 * 1024;
      if (maxBytes && total > maxBytes)
        throw new Error(`File exceeds your ${job.maxFileMB} MB limit.`);
      update({ name, mime, total, status: 'Uploading', speed: 0, eta: null });
      const headers = {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mime,
      };
      if (total !== null) headers['X-Upload-Content-Length'] = String(total);
      const init = await google(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,size,md5Checksum',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name,
            parents: [job.folder || 'root'],
            description: job.notes || undefined,
          }),
          signal,
        },
      );
      const session = init.headers.get('location');
      if (
        !session ||
        new URL(session).protocol !== 'https:' ||
        new URL(session).hostname !== 'www.googleapis.com'
      )
        throw new Error('Google did not return a valid upload session.');
      let uploaded = 0;
      const started = Date.now(),
        sha = createHash('sha256'),
        md5 = createHash('md5');
      for await (const { data, last } of chunks(response, settings.chunkMB * 1024 * 1024)) {
        signal.throwIfAborted();
        if (maxBytes && uploaded + data.length > maxBytes)
          throw new Error(`File exceeds your ${job.maxFileMB} MB limit.`);
        sha.update(data);
        md5.update(data);
        let digest;
        if (last) {
          digest = sha.digest('hex');
          if (job.expectedSha256 && digest !== job.expectedSha256)
            throw new Error('SHA-256 mismatch. The file was not finalized in Drive.');
        }
        if (last && total !== null && total !== uploaded + data.length)
          throw new Error('Source length changed during transfer.');
        const size = last ? uploaded + data.length : (total ?? '*');
        let result;
        for (let attempt = 0; attempt <= settings.retries; attempt++) {
          try {
            result = await google(session, {
              method: 'PUT',
              headers: {
                'Content-Type': mime,
                'Content-Range': data.length
                  ? `bytes ${uploaded}-${uploaded + data.length - 1}/${size}`
                  : `bytes */${size}`,
              },
              body: data,
              signal,
            });
            break;
          } catch (error) {
            if (
              signal.aborted ||
              attempt === settings.retries ||
              (error.status && error.status < 500 && ![408, 429].includes(error.status))
            )
              throw error;
            update({ status: 'Retrying', retryCount: attempt + 1 });
            await delay(Math.min(30000, 500 * 2 ** attempt), undefined, { signal });
            const probe = await google(session, {
              method: 'PUT',
              headers: { 'Content-Range': `bytes */${size}` },
              body: Buffer.alloc(0),
              signal,
            });
            const received = Number(probe.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
            if (probe.status !== 308 || received === uploaded + data.length) {
              result = probe;
              break;
            }
            if (received !== uploaded)
              throw new Error(
                'A chunk was partially received. Retry this transfer from the beginning.',
              );
          }
        }
        uploaded += data.length;
        const elapsed = Math.max(0.001, (Date.now() - started) / 1000),
          speed = uploaded / elapsed;
        update({
          uploaded,
          speed,
          eta: total !== null && speed ? (total - uploaded) / speed : null,
          status: 'Uploading',
        });
        if (result.status === 308) {
          const received = Number(result.headers.get('range')?.match(/-(\d+)$/)?.[1] ?? -1) + 1;
          if (received !== uploaded)
            throw new Error('Google did not acknowledge the complete chunk.');
          if (last) throw new Error('Google did not finalize this file.');
        } else {
          const file = await result.json();
          if (!last) throw new Error('Google finalized the file before the source ended.');
          const localMd5 = md5.digest('hex');
          if (file.md5Checksum && file.md5Checksum !== localMd5)
            throw new Error(`Drive checksum mismatch. Inspect file ${file.id} before using it.`);
          return {
            uploaded,
            total: uploaded,
            name,
            mime,
            sha256: digest,
            md5: localMd5,
            driveId: file.id,
            link:
              file.webViewLink ||
              `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
            speed: 0,
            eta: 0,
            duration: Date.now() - started,
            verified: !!file.md5Checksum,
          };
        }
        if (settings.speedLimitKB) {
          const wait = (uploaded / (settings.speedLimitKB * 1024)) * 1000 - (Date.now() - started);
          if (wait > 0) await delay(wait, undefined, { signal });
        }
      }
      throw new Error('Transfer ended without a final Google response.');
    } finally {
      response?.destroy();
    }
  };
}
