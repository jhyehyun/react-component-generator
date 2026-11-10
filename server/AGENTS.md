# server/AGENTS.md

## Module Context

Bun 런타임에서 도는 AI API 프록시. 프론트는 Vite 프록시(`/api` -> `localhost:3002`, `vite.config.ts`)로 접근한다.

## Tech Stack & Constraints

- 실행은 `Bun.serve`, 환경 변수는 `process.env`. Node 전용 API로 바꾸지 마라.
- 외부 호출은 SDK 없이 `fetch`로 직접 호출한다 (`server/index.ts:105,140`). 새 프로바이더도 같은 방식으로 추가하고, 스트리밍 응답을 `streamText`로 읽으며 `AbortSignal`을 `fetch`에 전달한다.
- 포트 3002는 `server/index.ts:211`와 `vite.config.ts` 프록시 target 두 곳에 있다. 변경 시 둘 다 수정한다.

## Implementation Patterns

- 부수효과 없는 로직은 `generator.ts`, `fallback.ts`에 순수 함수로 두고 `index.ts`는 라우팅과 외부 호출만 담당한다.
- 모든 응답은 `CORS_HEADERS`를 포함한다 (`server/index.ts:62`). 새 라우트의 `Response.json`에도 빠뜨리지 마라.
- 요청 본문은 `parseGenerateRequest`(`generator.ts`)로 검증하고 실패하면 400을 반환한다. 새 필드를 받으면 이 함수와 테스트에 먼저 추가한다.
- 에러는 `toClientError`(`generator.ts`)로 status와 메시지를 정한다. 업스트림 실패는 `UpstreamError(message, status)`로 던지면 503/429가 한국어 안내로 매핑된다(연결 단계와 스트림 중간 모두 동일). 사용자에게 보여도 되는 메시지만 `UserFacingError`로 던지고, 그 외 예외는 원문이 클라이언트에 나가지 않는다.
- `/api/generate`는 NDJSON(`delta`/`done`/`error`)으로 응답하며, 클라이언트가 끊으면 `ReadableStream.cancel()`이 업스트림 `fetch`를 abort한다 (`ndjsonResponse`).
- Gemini 모델 우선순위는 `GOOGLE_MODELS` 배열 순서다 (`server/index.ts:16`).

## Testing Strategy

- 실행: `bunx vitest run server`
- 패턴: 순수 함수에 대한 `describe/it` 단위 테스트, 한국어 케이스명 (`server/generator.test.ts`). 네트워크 호출은 테스트하지 않는다.

## Local Golden Rules

- Do: SYSTEM_PROMPT 수정 시 `generator.ts`의 후처리(`stripCodeFences`, `ensureRenderCall`)와 모순되지 않는지 확인하고 테스트를 갱신한다.
- Do: Gemini API 키는 URL 쿼리(`server/index.ts:136`)로 전달된다. 이 URL을 로그·에러 메시지에 출력하지 마라 (현재 에러는 status만 포함, 예기치 않은 예외 원문은 `toClientError`가 숨긴다).
- Don't: `/api/config`에 키 값을 반환하지 마라 (`server/index.ts:222`는 boolean만 반환).
- Don't: `withModelFallback`에서 에러를 삼키지 마라. 모두 실패하면 마지막 에러(`UpstreamError`)를 던져야 위 상태 코드 매핑이 동작한다 (`server/fallback.ts:19`).
