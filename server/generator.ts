// AI 응답 텍스트를 react-live에서 실행 가능한 코드로 정규화하는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

/** 응답에 섞여 나온 마크다운 코드펜스(```)를 제거한다. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:jsx|tsx|javascript|typescript)?\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();
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
    throw new Error(`Claude API error: ${event.error?.type ?? 'unknown'}`);
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
    throw new Error(`Gemini API error: ${chunk.error.code ?? 'unknown'}`);
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
