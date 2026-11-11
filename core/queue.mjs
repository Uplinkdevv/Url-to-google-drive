import { randomBytes, createHash } from 'node:crypto';
import { fileName } from '../lib.mjs';

export const activeStatuses = ['Connecting', 'Uploading', 'Retrying'];
export const terminalStatuses = ['Complete', 'Failed', 'Cancelled', 'Interrupted'];
export const statuses = ['Queued', 'Scheduled', 'Paused', ...activeStatuses, ...terminalStatuses];
const clean = (value, max = 240) =>
  String(value ?? '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, max);

export function normalizeInput(input, settings, now = Date.now()) {
  let url;
  try {
    url = new URL(String(input.url || '').trim());
  } catch {
    throw new Error('Enter a valid file URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  url.hash = '';
  const scheduledAt = input.scheduledAt ? Date.parse(input.scheduledAt) : 0;
  if (!Number.isFinite(scheduledAt)) throw new Error('Invalid schedule date.');
  const priority = Number(input.priority ?? settings.defaultPriority);
  if (![-1, 0, 1].includes(priority)) throw new Error('Invalid priority.');
  const tags = input.tags ?? settings.defaultTags;
  if (!Array.isArray(tags) || tags.length > 20) throw new Error('Use up to 20 tags.');
  const name = clean(input.name);
  const sha256 = clean(input.expectedSha256, 64).toLowerCase();
  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error('SHA-256 must contain exactly 64 hexadecimal characters.');
  if (input.allowHtml !== undefined && typeof input.allowHtml !== 'boolean')
    throw new Error('Allow HTML must be true or false.');
  return {
    url: url.href,
    sourceHost: url.hostname,
    sourceFingerprint: createHash('sha256').update(url.href).digest('hex'),
    name: name || fileName(url.href),
    customName: !!name,
    folder: clean(input.folder || settings.defaultFolder) || 'root',
    priority,
    scheduledAt: scheduledAt > now ? scheduledAt : null,
    tags: [...new Set(tags.map((t) => clean(t, 40)).filter(Boolean))],
    notes: clean(input.notes, 2000),
    allowHtml: input.allowHtml ?? settings.allowHtml,
    expectedSha256: sha256,
    nameTemplate: clean(input.nameTemplate ?? settings.nameTemplate),
    maxFileMB: settings.maxFileMB,
  };
}

export class TransferQueue {
  constructor(store, worker, { connected = () => false, now = () => Date.now() } = {}) {
    this.store = store;
    this.worker = worker;
    this.connected = connected;
    this.now = now;
    this.jobs = new Map();
    this.controllers = new Map();
    this.sources = new Map();
    this.timer = null;
    this.savingError = '';
  }
  async init() {
    await this.store.load();
    for (const saved of this.store.data.jobs) {
      const job = { ...saved };
      if (job.url) {
        this.sources.set(job.id, job.url);
        delete job.url;
      }
      if (activeStatuses.includes(job.status)) {
        job.status = 'Interrupted';
        job.error = 'The app stopped during this transfer. Retry to start again.';
      }
      if (['Queued', 'Scheduled', 'Paused'].includes(job.status) && !this.sources.has(job.id)) {
        job.status = 'Interrupted';
        job.error = 'The source URL was not saved. Add it again to retry.';
      }
      this.jobs.set(job.id, job);
    }
    this.timer = setInterval(() => this.pump(), 1000);
    this.timer.unref();
  }
  event(type, message, jobId) {
    this.store.data.events.unshift({
      id: randomBytes(6).toString('hex'),
      at: this.now(),
      type,
      message,
      jobId,
    });
    this.store.data.events = this.store.data.events.slice(0, 500);
  }
  async persist() {
    this.store.data.jobs = [...this.jobs.values()].map((job) => ({
      ...job,
      ...(this.store.data.settings.rememberSources && this.sources.has(job.id)
        ? { url: this.sources.get(job.id) }
        : {}),
    }));
    try {
      await this.store.save();
      this.savingError = '';
    } catch (error) {
      this.savingError = error.message;
      throw error;
    }
  }
  add(inputs) {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 500)
      throw new Error('Add between 1 and 500 URLs at a time.');
    if (this.jobs.size + inputs.length > 10000)
      throw new Error('Workspace limit reached. Clear old history before adding more.');
    const normalized = inputs.map((input) =>
      normalizeInput(input, this.store.data.settings, this.now()),
    );
    const added = [],
      skipped = [];
    for (const input of normalized) {
      const duplicate = [...this.jobs.values()].find(
        (j) =>
          j.sourceFingerprint === input.sourceFingerprint &&
          j.folder === input.folder &&
          !['Failed', 'Cancelled', 'Interrupted'].includes(j.status),
      );
      if (duplicate && this.store.data.settings.duplicatePolicy === 'skip') {
        skipped.push({ name: input.name, existingId: duplicate.id });
        continue;
      }
      const { url, ...fields } = input;
      const job = {
        ...fields,
        id: randomBytes(8).toString('hex'),
        status: input.scheduledAt ? 'Scheduled' : 'Queued',
        created: this.now(),
        updated: this.now(),
        uploaded: 0,
        total: null,
        attempts: 0,
        pinned: false,
        archived: false,
        events: [],
      };
      this.sources.set(job.id, url);
      this.jobs.set(job.id, job);
      added.push(job.id);
      this.event('queued', `Queued ${job.name}`, job.id);
    }
    return { added, skipped };
  }
  pump() {
    if (!this.connected() || this.store.data.settings.queuePaused) return;
    const capacity = this.store.data.settings.concurrency - this.controllers.size;
    if (capacity <= 0) return;
    const ready = [...this.jobs.values()]
      .filter(
        (j) =>
          ['Queued', 'Scheduled'].includes(j.status) &&
          (!j.scheduledAt || j.scheduledAt <= this.now()),
      )
      .sort((a, b) => b.priority - a.priority || a.created - b.created);
    for (const job of ready.slice(0, capacity)) this.run(job);
  }
  run(job) {
    const url = this.sources.get(job.id);
    if (!url) {
      job.status = 'Interrupted';
      job.error = 'Source URL unavailable. Add the link again.';
      return;
    }
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    job.status = 'Connecting';
    job.started = this.now();
    job.attempts++;
    job.error = '';
    job.uploaded = 0;
    job.updated = this.now();
    const update = (patch) => {
      Object.assign(job, patch, { updated: this.now() });
    };
    Promise.resolve()
      .then(() =>
        this.worker({ ...job, url }, controller.signal, update, { ...this.store.data.settings }),
      )
      .then((result) => {
        Object.assign(job, result, { status: 'Complete', finished: this.now() });
        this.event('complete', `Completed ${job.name}`, job.id);
      })
      .catch((error) => {
        job.status = controller.signal.aborted ? 'Cancelled' : 'Failed';
        job.error = controller.signal.aborted ? 'Transfer cancelled.' : error.message;
        job.finished = this.now();
        this.event(job.status.toLowerCase(), `${job.status}: ${job.name}`, job.id);
      })
      .finally(() => {
        job.updated = this.now();
        this.controllers.delete(job.id);
        this.prune();
        this.persist().catch(() => {});
        this.pump();
      });
    this.persist().catch(() => {});
  }
  action(id, action, data = {}) {
    const job = this.jobs.get(id);
    if (!job) throw new Error('Transfer not found.');
    const active = this.controllers.has(id);
    if (action === 'cancel') {
      if (active) this.controllers.get(id).abort();
      else if (['Queued', 'Scheduled', 'Paused'].includes(job.status)) {
        job.status = 'Cancelled';
        job.finished = this.now();
      }
    } else if (action === 'pause') {
      if (!['Queued', 'Scheduled'].includes(job.status))
        throw new Error('Only waiting transfers can be paused.');
      job.status = 'Paused';
    } else if (action === 'resume') {
      if (job.status !== 'Paused') throw new Error('This transfer is not paused.');
      job.status = job.scheduledAt > this.now() ? 'Scheduled' : 'Queued';
    } else if (action === 'retry') {
      if (!['Failed', 'Cancelled', 'Interrupted'].includes(job.status) || active)
        throw new Error('Only stopped transfers can be retried.');
      if (data.url) {
        const input = normalizeInput({ ...job, url: data.url }, this.store.data.settings);
        this.sources.set(id, input.url);
        job.sourceHost = input.sourceHost;
        job.sourceFingerprint = input.sourceFingerprint;
      }
      if (!this.sources.has(id)) throw new Error('Add the original URL to retry this transfer.');
      Object.assign(job, {
        status: 'Queued',
        uploaded: 0,
        error: '',
        scheduledAt: null,
        finished: null,
      });
    } else if (action === 'remove') {
      if (active || !terminalStatuses.includes(job.status))
        throw new Error('Stop the transfer before removing it.');
      this.jobs.delete(id);
      this.sources.delete(id);
    } else if (action === 'pin') job.pinned = !job.pinned;
    else if (action === 'archive') {
      if (!terminalStatuses.includes(job.status) || active)
        throw new Error('Only finished transfers can be archived.');
      job.archived = !job.archived;
    } else if (action === 'edit') {
      if (data.notes !== undefined) job.notes = clean(data.notes, 2000);
      if (data.tags !== undefined) {
        if (!Array.isArray(data.tags) || data.tags.length > 20)
          throw new Error('Use up to 20 tags.');
        job.tags = [...new Set(data.tags.map((t) => clean(t, 40)).filter(Boolean))];
      }
      if (data.priority !== undefined) {
        if (![-1, 0, 1].includes(data.priority)) throw new Error('Invalid priority.');
        job.priority = data.priority;
      }
      if (data.name !== undefined) {
        if (active || terminalStatuses.includes(job.status))
          throw new Error('Only waiting files can be renamed.');
        if (!clean(data.name)) throw new Error('Enter a file name.');
        job.name = clean(data.name);
        job.customName = true;
      }
    } else throw new Error('Unknown transfer action.');
    job.updated = this.now();
    return job;
  }
  prune() {
    const limit = this.store.data.settings.historyLimit;
    const candidates = [...this.jobs.values()]
      .filter(
        (j) => terminalStatuses.includes(j.status) && !j.pinned && !this.controllers.has(j.id),
      )
      .sort((a, b) => a.created - b.created);
    while (this.jobs.size > limit && candidates.length) {
      const job = candidates.shift();
      this.jobs.delete(job.id);
      this.sources.delete(job.id);
    }
  }
  snapshot() {
    return [...this.jobs.values()].map((job) => ({ ...job, canRetry: this.sources.has(job.id) }));
  }
  stats() {
    const jobs = [...this.jobs.values()];
    return {
      total: jobs.length,
      active: this.controllers.size,
      queued: jobs.filter((j) => ['Queued', 'Scheduled', 'Paused'].includes(j.status)).length,
      completed: jobs.filter((j) => j.status === 'Complete').length,
      failed: jobs.filter((j) => j.status === 'Failed').length,
      bytes: jobs.reduce((sum, j) => sum + (j.uploaded || 0), 0),
      speed: jobs
        .filter((j) => this.controllers.has(j.id))
        .reduce((sum, j) => sum + (j.speed || 0), 0),
    };
  }
  async close() {
    clearInterval(this.timer);
    for (const controller of this.controllers.values()) controller.abort();
    await this.persist();
  }
}
