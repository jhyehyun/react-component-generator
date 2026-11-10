import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistedState } from './usePersistedState';

describe('usePersistedState', () => {
  it('저장된 값이 없으면 초기값을 쓴다', () => {
    const { result } = renderHook(() => usePersistedState('k', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('저장된 값이 있으면 초기값 대신 복원한다', () => {
    localStorage.setItem('k', JSON.stringify('saved'));
    const { result } = renderHook(() => usePersistedState('k', 'init'));
    expect(result.current[0]).toBe('saved');
  });

  it('값이 바뀌면 localStorage에 저장한다', () => {
    const { result } = renderHook(() => usePersistedState('k', 'init'));
    act(() => result.current[1]('changed'));
    expect(JSON.parse(localStorage.getItem('k')!)).toBe('changed');
  });

  it('함수형 업데이트도 지원한다', () => {
    const { result } = renderHook(() => usePersistedState<number>('k', 1));
    act(() => result.current[1]((prev) => prev + 1));
    expect(result.current[0]).toBe(2);
    expect(JSON.parse(localStorage.getItem('k')!)).toBe(2);
  });

  it('revive가 있으면 복원한 값을 변환해서 쓴다', () => {
    localStorage.setItem('k', JSON.stringify('x'));
    const { result } = renderHook(() =>
      usePersistedState('k', 'init', (raw) => `${raw as string}!`),
    );
    expect(result.current[0]).toBe('x!');
  });
});
