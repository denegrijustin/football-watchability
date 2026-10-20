import { expect, test } from './fixtures';
import { openStream } from '../src/liveStream';
import { eventStream } from '../src/serverFeeds.js';

test('live connections pause when hidden, resume when visible, and cannot reopen after cleanup', () => {
  const globals = globalThis as any;
  const original = { document: globals.document, EventSource: globals.EventSource };
  let hidden = false;
  const doc = new EventTarget();
  Object.defineProperty(doc, 'hidden', { get: () => hidden });
  const sources: FakeSource[] = [];
  class FakeSource extends EventTarget {
    static CLOSED = 2;
    readyState = 1;
    onerror = null;
    constructor(_url: string) { super(); sources.push(this); }
    close() { this.readyState = 2; }
  }
  globals.document = doc;
  globals.EventSource = FakeSource;
  let score = 0;
  try {
    const stream = openStream<{ score: number }>('/api/live', 'scores', d => { score = d.score; });
    sources[0].dispatchEvent(new MessageEvent('scores', { data: '{"score":7}' }));
    expect(score).toBe(7);
    hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(sources[0].readyState).toBe(2);
    sources[0].dispatchEvent(new MessageEvent('scores', { data: '{"score":14}' }));
    expect(score).toBe(7);
    hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    expect(sources).toHaveLength(2);
    sources[1].dispatchEvent(new MessageEvent('scores', { data: '{"score":14}' }));
    expect(score).toBe(14);
    stream.close();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(sources).toHaveLength(2);
    expect(sources[1].readyState).toBe(2);
  } finally {
    for (const [key,value] of Object.entries(original)) {
      if (value === undefined) delete globals[key]; else globals[key] = value;
    }
  }
});

test('an aborted stream performs no upstream load; an unavailable snapshot is not a freshness event', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  expect((await eventStream('game', async () => { calls++; return '{}'; }, undefined, controller.signal)).status).toBe(204);
  expect(calls).toBe(0);
  const result = await eventStream('game', async () => null);
  expect(await result.text()).not.toContain('event: game');
  const failed = await eventStream('game', async () => { throw Error('offline'); });
  expect(await failed.text()).toContain('retry: 4000');
});
