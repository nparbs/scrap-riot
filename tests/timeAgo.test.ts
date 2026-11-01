import { describe, expect, it } from 'vitest';
import { timeAgo } from '../src/ui/timeAgo';

describe('last activity', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('reads naturally at every scale', () => {
    expect(timeAgo(ago(5), now)).toBe('just now');
    expect(timeAgo(ago(90), now)).toBe('1 min ago');
    expect(timeAgo(ago(45 * 60), now)).toBe('45 min ago');
    expect(timeAgo(ago(3 * 3600), now)).toBe('3 hr ago');
    expect(timeAgo(ago(30 * 3600), now)).toBe('yesterday');
    expect(timeAgo(ago(4 * 86400), now)).toBe('4 days ago');
  });

  it('treats a bad or future time as now', () => {
    expect(timeAgo('nonsense', now)).toBe('just now');
    expect(timeAgo(ago(-500), now)).toBe('just now');
  });
});
