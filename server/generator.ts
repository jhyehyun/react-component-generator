// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
}

/** 업스트림(Claude/Gemini) 에러. status로 503/429를 구분한다. */
export class UpstreamError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 사용자에게 그대로 보여도 되는 에러. 이 클래스가 아닌 예외의 원문은 클라이언트에 노출하지 않는다. */
export class UserFacingError extends Error {}

const UNKNOWN_ERROR_MESSAGE = '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

/** 예외를 클라이언트에 보낼 status와 메시지로 변환한다. 허용된 에러 외의 원문은 숨긴다. */
export function toClientError(err: unknown): { status: number; message: string } {
  if (err instanceof UpstreamError) {
    if (err.status === 503) {
      return { status: 503, message: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' };
    }
    if (err.status === 429) {
      return { status: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
    }
    return { status: 500, message: err.message };
  }
  if (err instanceof UserFacingError) {
    return { status: 500, message: err.message };
  }
  return { status: 500, message: UNKNOWN_ERROR_MESSAGE };
}

// src/utils/validatePrompt.ts의 MAX_PROMPT_LENGTH와 같은 값이다. 서버는 src를 import하지 않으므로 별도로 둔다.
const MAX_PROMPT_LENGTH = 500;
const MAX_API_KEY_LENGTH = 512;

export type GenerateRequest =
  | { ok: true; prompt: string; provider: 'anthropic' | 'google'; apiKey: string | undefined }
  | { ok: false; error: string };

/** 파싱된 /api/generate 요청 본문의 타입·길이·provider 값을 검증한다. */
export function parseGenerateRequest(raw: unknown): GenerateRequest {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Invalid request body' };
  }
  const body = raw as Record<string, unknown>;

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return { ok: false, error: 'Prompt is required' };
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { ok: false, error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.` };
  }

  const provider = body.provider ?? 'anthropic';
  if (provider !== 'anthropic' && provider !== 'google') {
    return { ok: false, error: 'Invalid provider' };
  }

  const apiKey = body.apiKey;
  if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > MAX_API_KEY_LENGTH)) {
    return { ok: false, error: 'Invalid API key' };
  }

  return { ok: true, prompt, provider, apiKey };
}

export interface StreamDelta {
  text: string;
  truncated: boolean;
}

/** 청크 단위로 들어오는 SSE 텍스트에서 완성된 이벤트의 data 페이로드만 뽑는다. */
export function createSSEParser(): (chunk: string) => string[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    return events.flatMap((event) =>
      event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim()),
    );
  };
}

/** Anthropic 스트림 이벤트에서 텍스트 조각과 max_tokens 잘림 여부를 꺼낸다. */
export function extractAnthropicDelta(payload: string): StreamDelta {
  const event = JSON.parse(payload) as {
    type?: string;
    delta?: { type?: string; text?: string; stop_reason?: string };
    error?: { type?: string };
  };
  if (event.type === 'error') {
    const errorType = event.error?.type ?? 'unknown';
    const status = errorType === 'overloaded_error' ? 503 : errorType === 'rate_limit_error' ? 429 : 500;
    throw new UpstreamError(`Claude API error: ${errorType}`, status);
  }
  return {
    text: event.type === 'content_block_delta' ? (event.delta?.text ?? '') : '',
    truncated: event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens',
  };
}

/** Gemini 스트림 청크에서 텍스트 조각과 MAX_TOKENS 잘림 여부를 꺼낸다. */
export function extractGeminiDelta(payload: string): StreamDelta {
  const chunk = JSON.parse(payload) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    error?: { code?: number | string };
  };
  if (chunk.error) {
    const code = chunk.error.code;
    throw new UpstreamError(`Gemini API error: ${code ?? 'unknown'}`, Number(code) || 500);
  }
  const candidate = chunk.candidates?.[0];
  return {
    text: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
    truncated: candidate?.finishReason === 'MAX_TOKENS',
  };
}

/**
 * react-live(noInline)는 `render(...)` 호출이 있어야 미리보기를 그린다.
 * 응답에 render 호출이 없으면 첫 컴포넌트 선언을 찾아 자동으로 주입한다.
 */
export function ensureRenderCall(code: string): string {
  if (/\brender\s*\(/.test(code)) return code;

  const match = code.match(/(?:const|function)\s+([A-Z]\w+)/);
  if (match) {
    return `${code}\n\nrender(<${match[1]} />);`;
  }
  return code;
}
