export function bytes(value) {
  if (value === null || value === undefined) return 'Unknown';
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const unit = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
}
export function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function filterJobs(
  jobs,
  { search = '', status = 'all', archived = false, pinned = false, sort = 'newest' } = {},
) {
  const query = search.toLowerCase().trim();
  return jobs
    .filter(
      (j) =>
        (archived || !j.archived) &&
        (!pinned || j.pinned) &&
        (status === 'all' || j.status === status) &&
        (!query ||
          [j.name, j.sourceHost, j.notes, ...j.tags].join(' ').toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === 'oldest'
          ? a.created - b.created
          : sort === 'name'
            ? a.name.localeCompare(b.name)
            : sort === 'size'
              ? (b.total || 0) - (a.total || 0)
              : sort === 'priority'
                ? b.priority - a.priority || a.created - b.created
                : b.created - a.created),
    );
}
export function pageJobs(jobs, page = 1, size = 25) {
  const pages = Math.max(1, Math.ceil(jobs.length / size)),
    current = Math.max(1, Math.min(page, pages));
  return {
    items: jobs.slice((current - 1) * size, current * size),
    page: current,
    pages,
    total: jobs.length,
  };
}
