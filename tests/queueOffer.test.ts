import { describe, expect, it } from 'vitest';
import { waitingQueue, type OnlineQueue, type OnlineStatus } from '../src/net/protocol';
import { onlineLabel } from '../src/ui/screens';

const status = (duel: number, brawl: number): OnlineStatus => ({ queued: duel + brawl, queues: { duel, brawl }, playing: 0, recent: [] });
const none = new Set<OnlineQueue>();

describe('the count of who is online', () => {
  it('goes by everyone around, and copes with a server that only knows about matches', () => {
    expect(onlineLabel({ ...status(1, 0), playing: 2, active: 5 })).toBe('5 online');
    expect(onlineLabel({ ...status(1, 0), playing: 2 })).toBe('3 online');
    expect(onlineLabel(null)).toBe('');
  });
});

describe('joining someone waiting online, from a bot fight', () => {
  it('stays quiet when nobody is waiting, or without a server', () => {
    expect(waitingQueue(status(0, 0), none)).toBeNull();
    expect(waitingQueue(null, none)).toBeNull();
  });

  it('prefers a duel, which starts as soon as you join', () => {
    expect(waitingQueue(status(1, 3), none)).toEqual({ queue: 'duel', waiting: 1 });
    expect(waitingQueue(status(0, 3), none)).toEqual({ queue: 'brawl', waiting: 3 });
  });

  it('respects a queue that was waved away, while still offering the other', () => {
    expect(waitingQueue(status(1, 0), new Set<OnlineQueue>(['duel']))).toBeNull();
    expect(waitingQueue(status(1, 2), new Set<OnlineQueue>(['duel']))).toEqual({ queue: 'brawl', waiting: 2 });
  });

  it('copes with an older server that does not split the queues', () => {
    expect(waitingQueue({ queued: 1, playing: 0, recent: [] } as unknown as OnlineStatus, none)).toBeNull();
  });
});
