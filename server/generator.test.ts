import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  ensureRenderCall,
  createSSEParser,
  extractAnthropicDelta,
  extractGeminiDelta,
  toClientError,
  parseGenerateRequest,
  UpstreamError,
  UserFacingError,
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

describe('toClientError', () => {
  it('status 503인 업스트림 에러는 과부하 안내와 503으로 매핑한다', () => {
    const result = toClientError(new UpstreamError('Gemini API error: 503', 503));
    expect(result).toEqual({
      status: 503,
      message: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
    });
  });

  it('status 429인 업스트림 에러는 요청 과다 안내와 429로 매핑한다', () => {
    const result = toClientError(new UpstreamError('Claude API error: 429', 429));
    expect(result).toEqual({ status: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  });

  it('그 외 status의 업스트림 에러는 메시지를 그대로 500으로 반환한다', () => {
    const result = toClientError(new UpstreamError('Claude API error: 400', 400));
    expect(result).toEqual({ status: 500, message: 'Claude API error: 400' });
  });

  it('메시지에 503 숫자가 섞여 있어도 일반 Error는 503으로 오인하지 않는다', () => {
    const result = toClientError(new Error('Claude API error: 5030'));
    expect(result.status).toBe(500);
  });

  it('사용자에게 보여도 되는 UserFacingError는 메시지를 그대로 전달한다', () => {
    const result = toClientError(new UserFacingError('생성된 코드가 비어 있습니다.'));
    expect(result).toEqual({ status: 500, message: '생성된 코드가 비어 있습니다.' });
  });

  it('SyntaxError 같은 예기치 않은 예외는 원문을 숨기고 고정 문구를 반환한다', () => {
    const result = toClientError(new SyntaxError('JSON Parse error: Unexpected EOF'));
    expect(result.status).toBe(500);
    expect(result.message).not.toContain('JSON Parse');
  });

  it('스트림 중간에 온 Anthropic overloaded_error는 503으로 매핑된다', () => {
    const payload = JSON.stringify({ type: 'error', error: { type: 'overloaded_error' } });
    let caught: unknown;
    try {
      extractAnthropicDelta(payload);
    } catch (err) {
      caught = err;
    }
    expect(toClientError(caught).status).toBe(503);
  });

  it('스트림 중간에 온 Gemini 429 에러는 429로 매핑된다', () => {
    const payload = JSON.stringify({ error: { code: 429 } });
    let caught: unknown;
    try {
      extractGeminiDelta(payload);
    } catch (err) {
      caught = err;
    }
    expect(toClientError(caught).status).toBe(429);
  });
});

describe('parseGenerateRequest', () => {
  it('유효한 요청이면 prompt를 trim하고 provider 기본값을 anthropic으로 채운다', () => {
    expect(parseGenerateRequest({ prompt: '  카드  ' })).toEqual({
      ok: true,
      prompt: '카드',
      provider: 'anthropic',
      apiKey: undefined,
    });
  });

  it('provider와 apiKey를 그대로 전달한다', () => {
    expect(parseGenerateRequest({ prompt: 'a', provider: 'google', apiKey: 'k' })).toMatchObject({
      ok: true,
      provider: 'google',
      apiKey: 'k',
    });
  });

  it('본문이 객체가 아니면 거부한다', () => {
    expect(parseGenerateRequest(null)).toMatchObject({ ok: false });
    expect(parseGenerateRequest('x')).toMatchObject({ ok: false });
  });

  it('prompt가 문자열이 아니거나 비어 있으면 거부한다', () => {
    expect(parseGenerateRequest({ prompt: { a: 1 } })).toEqual({ ok: false, error: 'Prompt is required' });
    expect(parseGenerateRequest({ prompt: '   ' })).toEqual({ ok: false, error: 'Prompt is required' });
  });

  it('prompt가 500자를 넘으면 거부한다', () => {
    const result = parseGenerateRequest({ prompt: 'a'.repeat(501) });
    expect(result).toEqual({ ok: false, error: '프롬프트는 500자 이하로 입력해주세요.' });
  });

  it('알 수 없는 provider는 거부한다', () => {
    expect(parseGenerateRequest({ prompt: 'a', provider: 'openai' })).toMatchObject({ ok: false });
  });

  it('apiKey가 문자열이 아니면 거부한다', () => {
    expect(parseGenerateRequest({ prompt: 'a', apiKey: 123 })).toMatchObject({ ok: false });
  });
});
