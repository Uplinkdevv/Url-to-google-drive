export function safeCSV(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function jobsCSV(jobs) {
  const fields = [
    'id',
    'name',
    'status',
    'sourceHost',
    'folder',
    'uploaded',
    'total',
    'created',
    'finished',
    'sha256',
    'link',
    'notes',
  ];
  return [
    fields.map(safeCSV).join(','),
    ...jobs.map((job) => fields.map((key) => safeCSV(job[key])).join(',')),
  ].join('\r\n');
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quote.');
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function parseBatch(text, format = 'text') {
  if (typeof text !== 'string' || text.length > 1024 * 1024)
    throw new Error('Import must be less than 1 MB.');
  if (format === 'json') {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data.transfers;
    if (!Array.isArray(rows)) throw new Error('JSON must contain a transfer array.');
    return rows.map((v) => (typeof v === 'string' ? { url: v } : v));
  }
  if (format === 'csv') {
    const [headers, ...rows] = parseCSV(text);
    if (!headers?.includes('url')) throw new Error('CSV requires a url column.');
    return rows
      .map((row) => Object.fromEntries(headers.map((header, i) => [header.trim(), row[i] || ''])))
      .map((row) => ({
        ...row,
        priority: row.priority ? Number(row.priority) : undefined,
        tags: row.tags ? row.tags.split(';') : undefined,
        allowHtml: row.allowHtml ? row.allowHtml === 'true' : undefined,
      }));
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((url) => ({ url }));
}
