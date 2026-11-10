import { describe, it, expect } from 'vitest';
import { validatePrompt, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePrompt', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하면 유효하다', () => {
    expect(validatePrompt('a'.repeat(500))).toEqual({ valid: true, length: 500 });
  });

  it('501자부터는 유효하지 않고 에러 메시지를 반환한다', () => {
    const result = validatePrompt('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.length).toBe(501);
    expect(result.error).toContain('500');
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePrompt(`  ${'a'.repeat(500)}  `).valid).toBe(true);
  });

  it('빈 문자열은 길이 0으로 유효하다', () => {
    expect(validatePrompt('')).toEqual({ valid: true, length: 0 });
  });
});
