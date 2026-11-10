import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { STORAGE_KEYS } from '../utils/storage';

const ndjson = (events: object[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('');

const mockGenerateResponse = (code: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(ndjson([{ type: 'delta', text: code }, { type: 'done', code }]), { status: 200 }),
    ),
  );
};

// 청크를 테스트가 직접 밀어 넣는 스트리밍 응답. 중간 상태를 검증할 때 쓴다.
const mockControlledStream = () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
  return {
    send: (events: object[]) => controller.enqueue(encoder.encode(ndjson(events))),
    close: () => controller.close(),
  };
};

describe('useComponentGenerator 스트리밍', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delta를 받을 때마다 streaming.code에 누적한다', async () => {
    const stream = mockControlledStream();
    const { result } = renderHook(() => useComponentGenerator());

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.generate('카드', undefined, 'google');
    });
    await act(async () => stream.send([{ type: 'delta', text: 'const ' }, { type: 'delta', text: 'A' }]));

    await vi.waitFor(() => expect(result.current.streaming).toMatchObject({ prompt: '카드', code: 'const A' }));

    await act(async () => {
      stream.close();
      await promise;
    });
  });

  it('done을 받으면 streaming을 비우고 같은 id로 컴포넌트를 추가한다', async () => {
    const stream = mockControlledStream();
    const { result } = renderHook(() => useComponentGenerator());

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.generate('카드', undefined, 'google');
    });
    await act(async () => stream.send([{ type: 'delta', text: 'x' }]));
    await vi.waitFor(() => expect(result.current.streaming).not.toBeNull());
    const streamingId = result.current.streaming!.id;

    await act(async () => {
      stream.send([{ type: 'done', code: 'final' }]);
      stream.close();
      await promise;
    });

    expect(result.current.streaming).toBeNull();
    expect(result.current.components[0]).toMatchObject({ id: streamingId, code: 'final' });
  });

  it('error 이벤트를 받으면 에러를 설정하고 컴포넌트를 추가하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(ndjson([{ type: 'delta', text: 'x' }, { type: 'error', message: '잘렸습니다' }])),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.error).toBe('잘렸습니다');
    expect(result.current.streaming).toBeNull();
    expect(result.current.components).toHaveLength(0);
  });

  it('done의 코드가 비어 있으면 에러로 처리하고 컴포넌트를 추가하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ndjson([{ type: 'done', code: '' }]))));
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.error).toBe('생성된 코드가 비어 있습니다. 다시 시도해주세요.');
    expect(result.current.components).toHaveLength(0);
  });

  it('done 없이 스트림이 끝나면 에러로 처리한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ndjson([{ type: 'delta', text: 'x' }]))));
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.error).toBe('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
    expect(result.current.components).toHaveLength(0);
  });

  it('HTTP 에러 응답의 error 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: '키 필요' }), { status: 400 })),
    );
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('카드', undefined, 'google'));

    expect(result.current.error).toBe('키 필요');
    expect(result.current.streaming).toBeNull();
  });
});

describe('useComponentGenerator 영속화', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('생성된 컴포넌트를 localStorage에 저장한다', async () => {
    mockGenerateResponse('const A = () => null;');
    const { result } = renderHook(() => useComponentGenerator());

    await act(() => result.current.generate('카드', undefined, 'google'));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ prompt: '카드', code: 'const A = () => null;' });
  });

  it('새로 마운트하면 저장된 컴포넌트를 복원하고 createdAt을 Date로 되돌린다', async () => {
    mockGenerateResponse('const A = () => null;');
    const first = renderHook(() => useComponentGenerator());
    await act(() => first.result.current.generate('카드', undefined, 'google'));
    first.unmount();

    const second = renderHook(() => useComponentGenerator());
    expect(second.result.current.components).toHaveLength(1);
    expect(second.result.current.components[0].prompt).toBe('카드');
    expect(second.result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('removeComponent와 clearAll 결과도 저장에 반영된다', async () => {
    mockGenerateResponse('const A = () => null;');
    const { result } = renderHook(() => useComponentGenerator());
    await act(() => result.current.generate('하나', undefined, 'google'));
    await act(() => result.current.generate('둘', undefined, 'google'));

    act(() => result.current.removeComponent(result.current.components[0].id));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!)).toHaveLength(1);

    act(() => result.current.clearAll());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.components)!)).toEqual([]);
  });

  it('저장된 데이터가 배열이 아니면 빈 목록으로 시작한다', () => {
    localStorage.setItem(STORAGE_KEYS.components, JSON.stringify({ broken: true }));
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toEqual([]);
  });
});
