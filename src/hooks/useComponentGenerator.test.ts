import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { STORAGE_KEYS } from '../utils/storage';

const mockGenerateResponse = (code: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ code }), { status: 200 })),
  );
};

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
