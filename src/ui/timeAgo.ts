/** A short, friendly "how long ago", such as "5 min ago". Anything odd or in the future counts as now. */
export function timeAgo(when: string, now = Date.now()): string {
  const seconds = (now - new Date(when).getTime()) / 1000;
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
