import { bytes, duration, filterJobs, pageJobs } from './model.js';
const $ = (id) => document.getElementById(id);
let state = {
    csrf: '',
    connected: false,
    jobs: [],
    templates: [],
    events: [],
    settings: {},
    stats: {},
  },
  view = 'overview',
  batch = false,
  page = 1,
  selected = new Set(),
  previousConnected = false,
  settingsLoaded = false,
  featuresLoaded = false;
const knownStatuses = new Map(),
  active = ['Connecting', 'Uploading', 'Retrying'],
  stopped = ['Complete', 'Failed', 'Cancelled', 'Interrupted'];
function el(tag, className = '', text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function notice(message, error = false) {
  $('notice-text').textContent = message;
  $('notice').hidden = !message;
  $('notice').classList.toggle('error', error);
}
async function api(path, data) {
  const response = await fetch(
    path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-App-Token': state.csrf },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
async function task(fn) {
  try {
    return await fn();
  } catch (error) {
    notice(error.message, true);
  }
}
function navigate(next) {
  if (!$(`view-${next}`)) next = 'overview';
  view = next;
  document.querySelectorAll('.view').forEach((node) => (node.hidden = node.id !== `view-${next}`));
  document
    .querySelectorAll('[data-view]')
    .forEach((node) => node.classList.toggle('active', node.dataset.view === next));
  $('breadcrumb').textContent = {
    overview: 'Overview',
    transfers: 'Transfers',
    templates: 'Templates',
    activity: 'Activity',
    settings: 'Settings',
    help: 'Help & setup',
  }[next];
  history.replaceState(null, '', `#${next}`);
  if (next === 'settings') fillSettings();
  render();
}
document
  .querySelectorAll('[data-view]')
  .forEach((button) => (button.onclick = () => navigate(button.dataset.view)));
document
  .querySelectorAll('[data-go]')
  .forEach((button) => (button.onclick = () => navigate(button.dataset.go)));
$('dismiss-notice').onclick = () => notice('');
function empty(
  container,
  title = 'A clear runway.',
  copy = 'Add a file URL to start your first transfer.',
) {
  const box = el('div', 'empty');
  box.append(el('span', 'empty-symbol', '⇅'), el('h3', '', title), el('p', '', copy));
  container.replaceChildren(box);
}
function button(text, action, className = 'text-button') {
  const node = el('button', className, text);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function jobRow(job, selection = false) {
  const row = el('article', 'job');
  if (selection) {
    const check = el('input');
    check.type = 'checkbox';
    check.checked = selected.has(job.id);
    check.setAttribute('aria-label', `Select ${job.name}`);
    check.onchange = () => {
      check.checked ? selected.add(job.id) : selected.delete(job.id);
      renderBulk();
    };
    row.append(check);
  } else
    row.append(
      el(
        'span',
        'file-icon',
        job.name.split('.').length > 1
          ? job.name.split('.').pop().slice(0, 4).toUpperCase()
          : 'FILE',
      ),
    );
  const name = el('div', 'job-main');
  name.append(button(job.name, () => showDetail(job.id), 'job-name'));
  const subtitle = el('div', 'job-subtitle');
  subtitle.append(el('span', '', job.sourceHost));
  if (job.priority === 1) subtitle.append(el('span', '', '↑ High priority'));
  if (job.tags.length)
    subtitle.append(
      el(
        'span',
        '',
        job.tags
          .slice(0, 2)
          .map((tag) => `#${tag}`)
          .join(' '),
      ),
    );
  if (job.scheduledAt && job.status === 'Scheduled')
    subtitle.append(el('span', '', new Date(job.scheduledAt).toLocaleString()));
  name.append(subtitle);
  if (active.includes(job.status)) {
    const progress = el('progress', 'progress');
    progress.max = 100;
    if (job.total) progress.value = Math.min(100, (job.uploaded / job.total) * 100);
    progress.setAttribute('aria-label', `${job.name} upload progress`);
    name.append(progress);
  }
  row.append(name);
  const size = el(
    'div',
    'job-size',
    job.status === 'Complete' ? bytes(job.total) : `${bytes(job.uploaded)} / ${bytes(job.total)}`,
  );
  if (active.includes(job.status))
    size.append(el('small', '', `${bytes(job.speed || 0)}/s · ${duration(job.eta)}`));
  row.append(size);
  const status = el('div', 'job-status');
  status.append(el('span', `status-badge status-${job.status.toLowerCase()}`, job.status));
  row.append(status);
  const actions = el('div', 'job-actions');
  const pin = button(
    job.pinned ? '★' : '☆',
    () => doAction(job.id, 'pin'),
    job.pinned ? 'pinned' : '',
  );
  pin.title = job.pinned ? 'Unpin transfer' : 'Pin transfer';
  pin.setAttribute('aria-label', pin.title);
  actions.append(pin);
  if (job.link) {
    const link = el('a', '', '↗');
    link.href = job.link;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.title = 'Open in Drive';
    link.setAttribute('aria-label', `Open ${job.name} in Drive`);
    actions.append(link);
  } else if (['Failed', 'Cancelled', 'Interrupted'].includes(job.status)) {
    const retry = button('↻', () => retryJob(job));
    retry.title = 'Retry transfer';
    retry.setAttribute('aria-label', 'Retry transfer');
    actions.append(retry);
  } else {
    const more = button('···', () => showDetail(job.id));
    more.setAttribute('aria-label', `Actions for ${job.name}`);
    actions.append(more);
  }
  row.append(actions);
  return row;
}
function filtered() {
  return filterJobs(state.jobs, {
    search: $('search').value,
    status: $('status-filter').value,
    sort: $('sort').value,
    archived: $('show-archived').checked,
    pinned: $('pinned-only').checked,
  });
}
function renderBulk() {
  selected = new Set([...selected].filter((id) => state.jobs.some((j) => j.id === id)));
  $('bulk-bar').hidden = !selected.size;
  $('selected-count').textContent = `${selected.size} selected`;
  const visible = pageJobs(filtered(), page).items;
  $('select-all').checked = visible.length > 0 && visible.every((j) => selected.has(j.id));
  $('select-all').indeterminate =
    visible.some((j) => selected.has(j.id)) && !$('select-all').checked;
}
function render() {
  const stats = state.stats;
  $('stat-bytes').textContent = bytes(stats.bytes || 0);
  $('stat-active').textContent = stats.active || 0;
  $('stat-completed').textContent = stats.completed || 0;
  $('stat-queued').textContent = stats.queued || 0;
  $('nav-count').textContent = stats.queued || 0;
  $('stat-speed').textContent = stats.active
    ? `${bytes(stats.speed || 0)}/s combined`
    : 'Ready when you are';
  $('queue-state').textContent = state.settings.queuePaused
    ? 'Queue paused'
    : state.connected
      ? 'Ready for the next file'
      : 'Waiting for a connection';
  $('queue-toggle').textContent = state.settings.queuePaused ? 'Resume queue' : 'Pause queue';
  if (view === 'overview') {
    const recent = filterJobs(state.jobs).slice(0, 5);
    $('recent-count').textContent = recent.length ? `/ ${state.jobs.length}` : '';
    if (recent.length) $('recent-jobs').replaceChildren(...recent.map((j) => jobRow(j)));
    else
      empty(
        $('recent-jobs'),
        'Your next file starts here.',
        'Paste a link above. We’ll take care of the journey.',
      );
  }
  if (view === 'transfers') {
    const paged = pageJobs(filtered(), page);
    page = paged.page;
    if (paged.items.length)
      $('all-jobs').replaceChildren(...paged.items.map((j) => jobRow(j, true)));
    else empty($('all-jobs'), 'No transfers found.', 'Try another filter or add a new file.');
    $('page-info').textContent = `Page ${page} of ${paged.pages} · ${paged.total} files`;
    $('prev-page').disabled = page === 1;
    $('next-page').disabled = page === paged.pages;
    renderBulk();
  }
  if (view === 'templates') {
    const cards = state.templates.map((template) => {
      const card = el('article', 'card template-card');
      card.append(
        el('span', 'template-symbol', '▤'),
        el('h2', '', template.name),
        el('p', 'muted', template.fields.nameTemplate || 'Keep original file names'),
        el('p', 'muted', (template.fields.tags || []).join(' · ') || 'No default tags'),
      );
      const actions = el('div', 'template-actions');
      actions.append(
        button('Use template →', () => {
          openTransfer();
          applyTemplate(template);
        }),
        button(
          'Delete',
          () =>
            task(async () => {
              if (!confirm(`Delete template “${template.name}”?`)) return;
              await api('/api/templates/remove', { id: template.id });
              await refresh();
            }),
          'text-button danger',
        ),
      );
      card.append(actions);
      return card;
    });
    if (cards.length) $('templates-grid').replaceChildren(...cards);
    else
      empty(
        $('templates-grid'),
        'A shortcut to your next transfer.',
        'Create a template for files you send often.',
      );
  }
  if (view === 'activity') {
    const events = state.events.map((event) => {
      const row = el('div', 'activity-item');
      const time = el('time', '', new Date(event.at).toLocaleString());
      time.dateTime = new Date(event.at).toISOString();
      row.append(time, el('span', '', event.message));
      return row;
    });
    if (events.length) $('activity-list').replaceChildren(...events);
    else
      empty(
        $('activity-list'),
        'Nothing to report yet.',
        'New transfers and connection events will appear here.',
      );
  }
}
async function refresh() {
  const next = await api('/api/state');
  for (const job of next.jobs) {
    const before = knownStatuses.get(job.id);
    if (before && before !== job.status) {
      if (job.status === 'Complete' && next.settings.notifyComplete)
        notice(`Delivered to Drive: ${job.name}`);
      if (job.status === 'Failed' && next.settings.notifyFailure)
        notice(`${job.name}: ${job.error}`, true);
    }
    knownStatuses.set(job.id, job.status);
  }
  state = next;
  $('connection-label').textContent = state.connected ? 'Drive connected' : 'Connect Drive';
  $('connection-dot').classList.toggle('connected', state.connected);
  $('account-connect').textContent = state.connected
    ? 'Manage connection →'
    : 'Set up Google Drive ↗';
  $('account-caption').textContent = state.connected
    ? 'Your Google Drive is ready to receive files.'
    : 'Connect Google Drive to start transferring.';
  $('config-status').textContent = state.configured
    ? 'Client loaded for this session.'
    : 'No client loaded.';
  $('connect').hidden = state.connected;
  $('disconnect').hidden = !state.connected;
  $('new-folder').disabled = !state.connected;
  $('refresh-folders').disabled = !state.connected;
  applyAppearance();
  render();
  if (state.savingError) notice(`History could not be saved: ${state.savingError}`, true);
  if (state.connected && !previousConnected) {
    previousConnected = true;
    await folders().catch((error) => notice(error.message, true));
  } else previousConnected = state.connected;
  if (!settingsLoaded) {
    fillSettings();
    settingsLoaded = true;
  }
  if (!featuresLoaded) {
    featuresLoaded = true;
    api('/api/features')
      .then((data) => {
        $('feature-summary').textContent =
          `${data.features.length} tracked capabilities · ${data.features.filter((f) => f.status === 'verified').length} verified · ${data.features.filter((f) => f.status === 'implemented').length} awaiting verification`;
      })
      .catch(() => {
        $('feature-summary').textContent = 'Feature inventory is being prepared.';
      });
  }
}
function applyAppearance() {
  const theme = state.settings.theme || 'system';
  document.documentElement.dataset.theme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.dataset.density = state.settings.density || 'comfortable';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);
$('theme-toggle').onclick = () =>
  task(async () => {
    await api('/api/settings', {
      theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
    });
    await refresh();
  });
function fillSettings() {
  for (const input of $('settings-form').elements) {
    if (!input.name) continue;
    const value = state.settings[input.name];
    if (input.type === 'checkbox') input.checked = !!value;
    else input.value = Array.isArray(value) ? value.join(', ') : (value ?? '');
  }
}
$('settings-form').onsubmit = (event) => {
  event.preventDefault();
  task(async () => {
    const settings = {};
    for (const input of event.target.elements) {
      if (!input.name) continue;
      settings[input.name] =
        input.type === 'checkbox'
          ? input.checked
          : input.type === 'number' || input.name === 'defaultPriority'
            ? Number(input.value)
            : input.name === 'defaultTags'
              ? input.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : input.value;
    }
    await api('/api/settings', settings);
    await refresh();
    notice('Workspace preferences saved.');
  });
};
$('reset-settings').onclick = () =>
  task(async () => {
    if (!confirm('Reset all workspace preferences to defaults?')) return;
    await api('/api/settings/reset', {});
    await refresh();
    fillSettings();
    notice('Default settings restored.');
  });
$('clear-history').onclick = () =>
  task(async () => {
    if (
      !confirm(
        'Remove unpinned finished transfers from local history? Files in Drive will stay untouched.',
      )
    )
      return;
    const result = await api('/api/history/clear', {});
    await refresh();
    notice(`Removed ${result.removed} history entries.`);
  });
$('queue-toggle').onclick = () =>
  task(async () => {
    await api('/api/settings', { queuePaused: !state.settings.queuePaused });
    await refresh();
  });
for (const id of ['search', 'status-filter', 'sort', 'show-archived', 'pinned-only'])
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    page = 1;
    render();
  });
$('prev-page').onclick = () => {
  page--;
  render();
};
$('next-page').onclick = () => {
  page++;
  render();
};
$('select-all').onchange = () => {
  for (const job of pageJobs(filtered(), page).items)
    $('select-all').checked ? selected.add(job.id) : selected.delete(job.id);
  render();
};
document.querySelectorAll('[data-bulk]').forEach(
  (node) =>
    (node.onclick = () =>
      task(async () => {
        const action = node.dataset.bulk;
        if (
          ['cancel', 'remove'].includes(action) &&
          !confirm(
            `${action === 'remove' ? 'Remove from local history' : 'Cancel'} ${selected.size} selected transfers?`,
          )
        )
          return;
        const result = await api('/api/bulk', { ids: [...selected], action });
        const errors = result.results.filter((r) => !r.ok);
        selected.clear();
        await refresh();
        notice(
          errors.length
            ? `${result.results.length - errors.length} updated. ${errors.length} could not be updated: ${errors[0].error}`
            : 'Selected transfers updated.',
          !!errors.length,
        );
      })),
);
async function doAction(id, action, data = {}) {
  return task(async () => {
    if (action === 'cancel' && state.settings.confirmCancel && !confirm('Cancel this transfer?'))
      return;
    if (
      action === 'remove' &&
      !confirm('Remove this entry from local history? The Drive file will stay untouched.')
    )
      return;
    await api(`/api/transfers/${id}/${action}`, data);
    await refresh();
    if ($('detail-dialog').open) {
      if (action === 'remove') $('detail-dialog').close();
      else showDetail(id);
    }
  });
}
function retryJob(job) {
  if (job.canRetry) return doAction(job.id, 'retry');
  const url = prompt('The original source was not saved. Paste the direct file URL to retry:');
  if (url) return doAction(job.id, 'retry', { url });
}
function showDetail(id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;
  const container = $('detail-content');
  container.replaceChildren(el('h3', '', job.name));
  const dl = el('dl', 'detail-grid');
  const pairs = {
    Status: job.status,
    Source: job.sourceHost,
    Destination: job.folder,
    Size: `${bytes(job.uploaded)} / ${bytes(job.total)}`,
    Created: new Date(job.created).toLocaleString(),
    Attempts: job.attempts,
    Priority: ['Low', 'Normal', 'High'][job.priority + 1],
    Tags: job.tags.join(', ') || '—',
    Notes: job.notes || '—',
    'SHA-256': job.sha256 || 'Not calculated yet',
    'Drive checksum': job.verified
      ? 'Verified'
      : job.status === 'Complete'
        ? 'Not supplied by Google'
        : 'Pending',
    Duration: job.duration ? duration(job.duration / 1000) : '—',
  };
  if (job.error) pairs.Error = job.error;
  for (const [key, value] of Object.entries(pairs))
    dl.append(el('dt', '', key), el('dd', '', String(value)));
  container.append(dl);
  const actions = el('div', 'detail-actions');
  if (['Queued', 'Scheduled'].includes(job.status))
    actions.append(button('Pause waiting job', () => doAction(id, 'pause'), 'secondary'));
  if (job.status === 'Paused')
    actions.append(button('Resume', () => doAction(id, 'resume'), 'secondary'));
  if (!stopped.includes(job.status))
    actions.append(button('Cancel transfer', () => doAction(id, 'cancel'), 'secondary'));
  if (['Failed', 'Cancelled', 'Interrupted'].includes(job.status))
    actions.append(button('Retry from beginning', () => retryJob(job), 'primary'));
  if (stopped.includes(job.status)) {
    actions.append(
      button(job.archived ? 'Unarchive' : 'Archive', () => doAction(id, 'archive'), 'secondary'),
      button('Remove history', () => doAction(id, 'remove'), 'secondary'),
    );
  }
  actions.append(
    button(job.pinned ? 'Unpin' : 'Pin', () => doAction(id, 'pin'), 'secondary'),
    button(
      'Edit notes',
      () => {
        const notes = prompt('Transfer notes', job.notes);
        if (notes !== null) doAction(id, 'edit', { notes });
      },
      'secondary',
    ),
    button(
      'Edit tags',
      () => {
        const tags = prompt('Comma-separated tags', job.tags.join(', '));
        if (tags !== null)
          doAction(id, 'edit', {
            tags: tags
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          });
      },
      'secondary',
    ),
  );
  if (['Queued', 'Scheduled', 'Paused'].includes(job.status)) {
    actions.append(
      button(
        'Rename',
        () => {
          const name = prompt('File name', job.name);
          if (name) doAction(id, 'edit', { name });
        },
        'secondary',
      ),
      button(
        'Change priority',
        () => {
          const value = prompt(
            'Priority: high, normal, or low',
            ['low', 'normal', 'high'][job.priority + 1],
          );
          if (value !== null) {
            const priority = { high: 1, normal: 0, low: -1 }[value.trim().toLowerCase()];
            if (priority === undefined) notice('Enter high, normal, or low.', true);
            else doAction(id, 'edit', { priority });
          }
        },
        'secondary',
      ),
    );
  }
  if (job.link) {
    const link = el('a', 'primary', 'Open in Drive ↗');
    link.href = job.link;
    link.target = '_blank';
    link.rel = 'noreferrer';
    actions.append(
      link,
      button(
        'Copy Drive link',
        () =>
          task(async () => {
            await navigator.clipboard.writeText(job.link);
            notice('Drive link copied.');
          }),
        'secondary',
      ),
    );
  }
  container.append(actions);
  if (!$('detail-dialog').open) $('detail-dialog').showModal();
}
function setBatch(value) {
  batch = value;
  $('batch-fields').hidden = !value;
  $('single-fields').hidden = value;
  $('url').required = !value;
  $('single-tab').classList.toggle('active', !value);
  $('batch-tab').classList.toggle('active', value);
}
function openTransfer(asBatch = false) {
  $('transfer-form').reset();
  $('dialog-error').hidden = true;
  $('priority').value = state.settings.defaultPriority ?? 0;
  $('tags').value = (state.settings.defaultTags || []).join(', ');
  $('allow-html').checked = !!state.settings.allowHtml;
  $('name-template').value = state.settings.nameTemplate || '';
  setBatch(asBatch);
  $('apply-template').replaceChildren(
    new Option('Apply template…', ''),
    ...state.templates.map((t) => new Option(t.name, t.id)),
  );
  $('transfer-dialog').showModal();
  (asBatch ? $('batch-text') : $('url')).focus();
}
for (const id of ['new-transfer', 'transfer-add']) $(id).onclick = () => openTransfer();
$('batch-open').onclick = () => openTransfer(true);
$('single-tab').onclick = () => setBatch(false);
$('batch-tab').onclick = () => setBatch(true);
function transferFields() {
  return {
    folder: $('folder').value,
    priority: Number($('priority').value),
    allowHtml: $('allow-html').checked,
    tags: $('tags')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    notes: $('notes').value,
    nameTemplate: $('name-template').value,
    scheduledAt: $('schedule').value ? new Date($('schedule').value).toISOString() : undefined,
  };
}
$('quick-form').onsubmit = (event) => {
  event.preventDefault();
  task(async () => {
    const result = await api('/api/transfers', { url: $('quick-url').value });
    $('quick-url').value = '';
    await refresh();
    notice(
      result.added.length
        ? `Transfer queued.${state.connected ? '' : ' Connect Google Drive to start.'}`
        : 'That URL is already in this destination.',
    );
  });
};
$('transfer-form').onsubmit = async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  submit.disabled = true;
  try {
    let result;
    if (batch) {
      result = await api('/api/import', {
        text: $('batch-text').value,
        format: $('batch-format').value,
        defaults: transferFields(),
      });
    } else
      result = await api('/api/transfers', {
        ...transferFields(),
        url: $('url').value,
        name: $('filename').value,
        expectedSha256: $('expected-hash').value,
      });
    $('transfer-dialog').close();
    await refresh();
    notice(
      `${result.added.length} transfer${result.added.length === 1 ? '' : 's'} queued${result.skipped.length ? ` · ${result.skipped.length} duplicates skipped` : ''}.${state.connected ? '' : ' Connect Drive to start.'}`,
    );
  } catch (error) {
    $('dialog-error').textContent = error.message;
    $('dialog-error').hidden = false;
  } finally {
    submit.disabled = false;
  }
};
$('batch-file').onchange = () =>
  task(async () => {
    const file = $('batch-file').files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) throw new Error('Import files must be under 1 MB.');
    $('batch-text').value = await file.text();
    $('batch-format').value = file.name.endsWith('.json')
      ? 'json'
      : file.name.endsWith('.csv')
        ? 'csv'
        : 'text';
  });
function applyTemplate(template) {
  const f = template.fields;
  if (f.folder && [...$('folder').options].some((o) => o.value === f.folder))
    $('folder').value = f.folder;
  $('priority').value = f.priority ?? 0;
  $('tags').value = (f.tags || []).join(', ');
  $('notes').value = f.notes || '';
  $('allow-html').checked = !!f.allowHtml;
  $('name-template').value = f.nameTemplate || '';
}
$('apply-template').onchange = () => {
  const template = state.templates.find((t) => t.id === $('apply-template').value);
  if (template) applyTemplate(template);
};
$('template-add').onclick = () => {
  $('template-form').reset();
  $('template-dialog').showModal();
};
$('template-form').onsubmit = (event) => {
  event.preventDefault();
  task(async () => {
    await api('/api/templates', {
      name: $('template-name').value,
      fields: {
        folder: 'root',
        nameTemplate: $('template-pattern').value,
        priority: Number($('template-priority').value),
        tags: $('template-tags')
          .value.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
    $('template-dialog').close();
    await refresh();
    notice('Template saved.');
  });
};
async function folders() {
  const result = await api('/api/folders'),
    selected = $('folder').value;
  $('folder').replaceChildren(
    new Option('My Drive', 'root'),
    ...result.folders
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => new Option(f.name, f.id)),
  );
  if ([...$('folder').options].some((o) => o.value === selected)) $('folder').value = selected;
}
$('refresh-folders').onclick = () => task(folders);
$('new-folder').onclick = () => {
  $('folder-form').reset();
  $('folder-dialog').showModal();
};
$('folder-form').onsubmit = (event) => {
  event.preventDefault();
  task(async () => {
    const folder = await api('/api/folders', {
      name: $('folder-name').value,
      parent: $('folder').value,
    });
    await folders();
    $('folder').value = folder.id;
    $('folder-dialog').close();
  });
};
for (const id of ['connection-button', 'account-connect']) $(id).onclick = () => navigate('help');
$('connect').onclick = () =>
  task(async () => {
    if (!state.configured) {
      notice('Choose your Google Desktop app client JSON first.', true);
      return;
    }
    const result = await api('/api/connect', {});
    location.assign(result.url);
  });
$('disconnect').onclick = () =>
  task(async () => {
    await api('/api/disconnect', {});
    await refresh();
    notice('Google Drive disconnected.');
  });
$('credentials').onchange = () =>
  task(async () => {
    const file = $('credentials').files[0];
    if (!file) return;
    if (file.size > 65536) throw new Error('The Google client JSON should be smaller than 64 KB.');
    await api('/api/config', JSON.parse(await file.text()));
    await refresh();
    notice('Client loaded. Connect Google Drive when ready.');
  });
document
  .querySelectorAll('.close-dialog')
  .forEach((node) => (node.onclick = () => node.closest('dialog').close()));
document.addEventListener('keydown', (event) => {
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    document.querySelector('dialog[open]')
  )
    return;
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openTransfer();
  }
  if (event.key === '/') {
    event.preventDefault();
    navigate('transfers');
    $('search').focus();
  }
});
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
window.addEventListener('offline', () =>
  notice('This computer is offline. Active transfers may fail; reconnect and retry.', true),
);
window.addEventListener('online', () =>
  notice('Connection restored. You can retry failed transfers.'),
);
async function poll() {
  try {
    await refresh();
  } catch (error) {
    notice(`Relay is unreachable: ${error.message}`, true);
  }
  setTimeout(poll, (state.settings.refreshSeconds || 2) * 1000);
}
navigate(location.hash.slice(1) || 'overview');
poll();
