import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadStored, saveStored } from './storage';

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('저장된 값이 없으면 fallback을 반환한다', () => {
    expect(loadStored('missing', 'default')).toBe('default');
  });

  it('saveStored로 저장한 값을 loadStored로 읽는다', () => {
    saveStored('k', { a: 1, list: ['x'] });
    expect(loadStored('k', null)).toEqual({ a: 1, list: ['x'] });
  });

  it('JSON이 깨져 있으면 fallback을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    expect(loadStored('k', 'default')).toBe('default');
  });

  it('revive가 있으면 파싱 결과를 변환해 반환한다', () => {
    saveStored('k', 2);
    expect(loadStored('k', 0, (raw) => (raw as number) * 10)).toBe(20);
  });

  it('revive가 예외를 던지면 fallback을 반환한다', () => {
    saveStored('k', 2);
    const revive = () => {
      throw new Error('invalid');
    };
    expect(loadStored('k', 'default', revive)).toBe('default');
  });

  it('localStorage 쓰기가 실패해도 예외를 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveStored('k', 'v')).not.toThrow();
  });
});
