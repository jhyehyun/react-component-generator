import { describe, it, expect } from 'vitest';
import { readNdjson } from './readNdjson';

const streamOf = (...chunks: string[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
};

const collect = async (body: ReadableStream<Uint8Array>) => {
  const events: unknown[] = [];
  for await (const event of readNdjson(body)) events.push(event);
  return events;
};

describe('readNdjson', () => {
  it('줄 단위 JSON을 순서대로 파싱한다', async () => {
    const events = await collect(streamOf('{"a":1}\n{"a":2}\n'));
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('청크 경계에서 잘린 줄은 다음 청크와 합쳐 파싱한다', async () => {
    const events = await collect(streamOf('{"a"', ':1}\n'));
    expect(events).toEqual([{ a: 1 }]);
  });

  it('멀티바이트 문자가 청크 경계에서 쪼개져도 깨지지 않는다', async () => {
    const bytes = new TextEncoder().encode('{"t":"한"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ t: '한' }]);
  });

  it('소비자가 중간에 멈추면 본문 스트림을 취소한다', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"a":1}\n{"a":2}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const event of readNdjson(body)) {
      expect(event).toEqual({ a: 1 });
      break;
    }

    expect(cancelled).toBe(true);
  });

  it('개행 없이 끝난 마지막 줄도 파싱한다', async () => {
    expect(await collect(streamOf('{"a":1}'))).toEqual([{ a: 1 }]);
  });
});
