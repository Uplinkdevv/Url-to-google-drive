import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export const defaults = Object.freeze({
  concurrency: 3,
  queuePaused: false,
  theme: 'system',
  density: 'comfortable',
  defaultFolder: 'root',
  defaultPriority: 0,
  allowHtml: false,
  maxFileMB: 0,
  retries: 3,
  chunkMB: 8,
  duplicatePolicy: 'skip',
  historyLimit: 1000,
  rememberSources: false,
  notifyComplete: false,
  notifyFailure: true,
  confirmCancel: true,
  refreshSeconds: 2,
  defaultTags: [],
  nameTemplate: '',
  speedLimitKB: 0,
});

export class Store {
  constructor(directory) {
    this.directory = directory;
    this.file = join(directory, 'state.json');
    this.data = {
      version: 2,
      settings: { ...defaults },
      jobs: [],
      templates: [],
      rules: [],
      events: [],
    };
    this.writes = Promise.resolve();
  }
  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw.version !== 2) throw new Error('Unsupported state version');
      this.data = { ...this.data, ...raw, settings: { ...defaults, ...raw.settings } };
    } catch (error) {
      if (error.code !== 'ENOENT')
        throw new Error(
          `Cannot read saved workspace: ${error.message}. The original file has been preserved.`,
        );
    }
    return this.data;
  }
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    const operation = this.writes
      .catch(() => {})
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        await writeFile(`${this.file}.tmp`, snapshot, { mode: 0o600 });
        await rename(`${this.file}.tmp`, this.file);
      });
    this.writes = operation;
    return operation;
  }
}

export function validateSettings(input, current = defaults) {
  const result = { ...current };
  const numbers = {
    concurrency: [1, 8],
    maxFileMB: [0, 10000000],
    retries: [0, 8],
    chunkMB: [1, 32],
    historyLimit: [100, 10000],
    refreshSeconds: [1, 30],
    speedLimitKB: [0, 1000000],
    defaultPriority: [-1, 1],
  };
  const choices = {
    theme: ['system', 'light', 'dark'],
    density: ['comfortable', 'compact'],
    duplicatePolicy: ['skip', 'allow'],
  };
  const bools = [
    'queuePaused',
    'allowHtml',
    'rememberSources',
    'notifyComplete',
    'notifyFailure',
    'confirmCancel',
  ];
  for (const [key, value] of Object.entries(input)) {
    if (numbers[key]) {
      const [min, max] = numbers[key];
      if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`${key} must be an integer between ${min} and ${max}.`);
      result[key] = value;
    } else if (choices[key]) {
      if (!choices[key].includes(value)) throw new Error(`Invalid ${key}.`);
      result[key] = value;
    } else if (bools.includes(key)) {
      if (typeof value !== 'boolean') throw new Error(`${key} must be true or false.`);
      result[key] = value;
    } else if (['defaultFolder', 'nameTemplate'].includes(key)) {
      if (typeof value !== 'string' || value.length > 240) throw new Error(`Invalid ${key}.`);
      result[key] = value;
    } else if (key === 'defaultTags') {
      if (
        !Array.isArray(value) ||
        value.length > 20 ||
        value.some((v) => typeof v !== 'string' || v.length > 40)
      )
        throw new Error('Use at most 20 tags, each up to 40 characters.');
      result[key] = [...new Set(value)];
    } else throw new Error(`Unknown setting: ${key}.`);
  }
  return result;
}
