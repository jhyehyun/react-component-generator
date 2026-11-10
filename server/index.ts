import {
  stripCodeFences,
  ensureRenderCall,
  createSSEParser,
  extractAnthropicDelta,
  extractGeminiDelta,
  parseGenerateRequest,
  toClientError,
  UpstreamError,
  UserFacingError,
} from './generator';
import type { StreamDelta } from './generator';
import { withModelFallback } from './fallback';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

const TRUNCATED_MESSAGE = '생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.';

// 업스트림 SSE 본문을 읽어 텍스트 조각을 차례로 내보낸다.
// failOnTruncate가 true면 max tokens 잘림을 에러로 던진다 (Gemini 경로만 사용).
async function* streamText(
  response: Response,
  extract: (payload: string) => StreamDelta,
  failOnTruncate: boolean,
): AsyncGenerator<string> {
  const parse = createSSEParser();
  const decoder = new TextDecoder();
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    for (const payload of parse(decoder.decode(chunk, { stream: true }))) {
      if (payload === '[DONE]') continue;
      const { text, truncated } = extract(payload);
      if (text) yield text;
      if (truncated && failOnTruncate) throw new UserFacingError(TRUNCATED_MESSAGE);
    }
  }
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<string>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new UpstreamError(`Claude API error: ${response.status}`, response.status);
  }

  return streamText(response, extractAnthropicDelta, false);
}

// 폴백은 스트림 연결 단계(응답 수신)까지만 적용된다. 스트리밍이 시작된 뒤의 실패는 그대로 전파한다.
async function connectGoogleModel(
  prompt: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new UpstreamError(`Gemini API error: ${response.status}`, response.status);
  }

  return response;
}

async function callGoogle(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<string>> {
  const response = await withModelFallback(GOOGLE_MODELS, (model) =>
    connectGoogleModel(prompt, apiKey, model, signal),
  );
  return streamText(response, extractGeminiDelta, true);
}

function errorResponse(err: unknown): Response {
  const { status, message } = toClientError(err);
  return Response.json({ error: message }, { status, headers: CORS_HEADERS });
}

// 클라이언트로 보내는 NDJSON 스트림: {type:'delta',text} → {type:'done',code} | {type:'error',message}
// 클라이언트가 연결을 끊으면(cancel) 업스트림 요청도 함께 중단한다.
function ndjsonResponse(source: AsyncGenerator<string>, upstream: AbortController): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        let full = '';
        for await (const text of source) {
          full += text;
          send({ type: 'delta', text });
        }
        const code = ensureRenderCall(stripCodeFences(full));
        if (!code) throw new UserFacingError('생성된 코드가 비어 있습니다. 다시 시도해주세요.');
        send({ type: 'done', code });
      } catch (err) {
        send({ type: 'error', message: toClientError(err).message });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      upstream.abort();
    },
  });
  return new Response(stream, {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const raw: unknown = await req.json().catch(() => null);
        const parsed = parseGenerateRequest(raw);

        if (!parsed.ok) {
          return Response.json(
            { error: parsed.error },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const { prompt, apiKey, provider } = parsed;
        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const upstream = new AbortController();
        const source =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey, upstream.signal)
            : await callAnthropic(prompt, resolvedKey, upstream.signal);

        return ndjsonResponse(source, upstream);
      } catch (err) {
        return errorResponse(err);
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
