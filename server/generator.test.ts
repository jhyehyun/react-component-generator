import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  ensureRenderCall,
  createSSEParser,
  extractAnthropicDelta,
  extractGeminiDelta,
} from './generator';

describe('stripCodeFences', () => {
  it('언어 태그가 붙은 코드펜스를 제거한다', () => {
    const input = '```tsx\nconst A = () => null;\n```';
    expect(stripCodeFences(input)).toBe('const A = () => null;');
  });

  it('언어 태그 없는 코드펜스도 제거한다', () => {
    const input = '```\nconst A = 1;\n```';
    expect(stripCodeFences(input)).toBe('const A = 1;');
  });

  it('펜스가 없으면 앞뒤 공백만 정리해 그대로 반환한다', () => {
    expect(stripCodeFences('  const A = 1;  ')).toBe('const A = 1;');
  });
});

describe('ensureRenderCall', () => {
  it('이미 render() 호출이 있으면 그대로 둔다', () => {
    const code = 'const Card = () => null;\nrender(<Card />);';
    expect(ensureRenderCall(code)).toBe(code);
  });

  it('const 컴포넌트 선언에 render 호출을 주입한다', () => {
    const code = 'const Card = () => null;';
    expect(ensureRenderCall(code)).toBe(`${code}\n\nrender(<Card />);`);
  });

  it('function 선언 컴포넌트에도 render 호출을 주입한다', () => {
    const code = 'function Widget() { return null; }';
    expect(ensureRenderCall(code)).toContain('render(<Widget />);');
  });

  it('대문자로 시작하는 컴포넌트 선언이 없으면 원본을 그대로 반환한다', () => {
    const code = 'const value = 42;';
    expect(ensureRenderCall(code)).toBe(code);
  });
});

describe('createSSEParser', () => {
  it('완성된 이벤트의 data 페이로드를 반환한다', () => {
    const parse = createSSEParser();
    expect(parse('data: {"a":1}\n\ndata: {"a":2}\n\n')).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('청크 경계에서 잘린 이벤트는 다음 청크와 합쳐 반환한다', () => {
    const parse = createSSEParser();
    expect(parse('data: {"a"')).toEqual([]);
    expect(parse(':1}\n\n')).toEqual(['{"a":1}']);
  });

  it('CRLF 줄바꿈과 data 이외의 줄(event:)은 무시한다', () => {
    const parse = createSSEParser();
    expect(parse('event: x\r\ndata: hi\r\n\r\n')).toEqual(['hi']);
  });
});

describe('extractAnthropicDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const payload = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'const' } });
    expect(extractAnthropicDelta(payload)).toEqual({ text: 'const', truncated: false });
  });

  it('stop_reason이 max_tokens이면 잘림으로 표시한다', () => {
    const payload = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(extractAnthropicDelta(payload)).toEqual({ text: '', truncated: true });
  });

  it('error 이벤트를 받으면 에러를 던진다', () => {
    const payload = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    expect(() => extractAnthropicDelta(payload)).toThrow('Claude API error: overloaded_error');
  });

  it('관련 없는 이벤트는 빈 텍스트를 반환한다', () => {
    expect(extractAnthropicDelta(JSON.stringify({ type: 'ping' }))).toEqual({ text: '', truncated: false });
  });
});

describe('extractGeminiDelta', () => {
  it('candidates의 parts 텍스트를 이어 붙인다', () => {
    const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(extractGeminiDelta(payload)).toEqual({ text: 'ab', truncated: false });
  });

  it('error 필드가 있는 청크는 에러를 던진다', () => {
    const payload = JSON.stringify({ error: { code: 503, message: 'overloaded' } });
    expect(() => extractGeminiDelta(payload)).toThrow('Gemini API error: 503');
  });

  it('finishReason이 MAX_TOKENS이면 잘림으로 표시한다', () => {
    const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }] });
    expect(extractGeminiDelta(payload)).toEqual({ text: 'x', truncated: true });
  });
});
