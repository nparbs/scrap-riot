import { describe, expect, it } from 'vitest';
import { waitingQueue, type OnlineQueue, type OnlineStatus } from '../src/net/protocol';

const status = (duel: number, brawl: number): OnlineStatus => ({ queued: duel + brawl, queues: { duel, brawl }, playing: 0, recent: [] });
const none = new Set<OnlineQueue>();

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
