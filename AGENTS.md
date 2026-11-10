# AGENTS.md

## Operational Commands

- 패키지 관리자는 `bun` 고정 (`bun.lock` 존재). npm/yarn/pnpm 사용 금지.
- 설치: `bun install`
- 개발 (API 서버 :3002 + Vite :5173 동시): `bun run dev`
- API 서버만: `bun run server`
- 테스트 전체: `bun run test` (vitest, jsdom). 단일 파일: `bunx vitest run <경로>`
- 타입 체크 + 빌드: `bun run build`
- 린트: `bun run lint`
- 변경 후 완료 보고 전 `bun run test`, `bun run lint`, `bun run build`를 실행한다.

## Golden Rules

### Immutable

- API 키는 클라이언트 번들에 넣지 않는다. 환경 키는 서버만 읽고(`server/index.ts:70-73`), 클라이언트에는 보유 여부 boolean만 노출한다(`server/index.ts:222-225`, `src/App.tsx:46`). 키 값을 `/api/config` 응답에 추가하지 마라.
- `.env`는 커밋하지 않는다 (`.gitignore`에 등록). 키를 코드·테스트·로그에 하드코딩하지 마라.
- 사용자가 UI에 입력한 키는 요청 body로만 서버에 전달한다. 브라우저에는 `localStorage`의 `STORAGE_KEYS.apiKey`에만 저장하며(`src/App.tsx`, `src/utils/storage.ts`), 사용자가 요청한 동작이다. 쿼리스트링·로그·서버 저장·다른 저장소로 확장하지 마라. 저장 키는 `rcg:` 접두사를 유지한다.

- 민감 파일(`.env`, `.env.*`, 이름에 `credential`/`secret`이 들어간 파일, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `.npmrc`, `.netrc`, `~/.ssh`, `~/.aws`, `~/.config/gcloud`)은 읽기·수정·삭제를 하지 마라. `.claude/settings.json`의 `permissions.deny`가 같은 규칙을 강제하며, 두 곳은 항상 함께 갱신한다. 우회(셸 변수·경로 조합 등)도 금지다.

### Hard Constraint

- 미리보기는 `react-live`의 `noInline` 모드다 (`src/components/LivePreview.tsx:11`). 생성 코드 마지막에 `render(<Component />)` 호출이 있어야 그려지며, import 문과 TypeScript 문법은 쓸 수 없다. 이 규칙은 `server/index.ts:22,23,31`의 SYSTEM_PROMPT와 짝이므로 한쪽만 바꾸지 마라.
- React는 생성 코드의 전역 스코프에서 제공된다. 프롬프트 예시는 `React.useState` 형태를 쓴다 (`server/index.ts:35`).
- `/api/generate`는 NDJSON 스트림(`delta`/`done`/`error`)으로 응답한다. 서버의 `ndjsonResponse`(`server/index.ts`)와 클라이언트 `StreamEvent`(`src/types/index.ts`)는 짝이므로 이벤트 형식을 한쪽만 바꾸지 마라.

### Double Defense

- `render()` 호출 보장은 프롬프트 지시(`server/index.ts:12`)와 후처리 `ensureRenderCall`(`server/generator.ts:138`) 두 곳에서 한다. 코드펜스 제거도 프롬프트(`server/index.ts:27`)와 `stripCodeFences`(`server/generator.ts:5`)로 이중 방어한다. 후처리는 스트림 종료 시 `ndjsonResponse`의 `done` 이벤트에서 한 번만 적용된다(`delta`에는 적용되지 않음). 한쪽을 제거하지 마라.

### Asymmetry

- Gemini 경로에만 모델 폴백(`withModelFallback`, `server/index.ts:161-163`, 스트림 연결 단계에만 적용)과 `MAX_TOKENS` 잘림 검사(`streamText`의 `failOnTruncate`, `server/index.ts:95`)가 있다. Anthropic 경로(`callAnthropic`)에는 없다. 프로바이더를 추가·수정할 때 이 차이가 의도인지 확인하고, 동일 처리가 필요하면 함께 반영하라.

### Test Boundary

- 테스트가 있는 곳: `server/generator.ts`, `server/fallback.ts`, `src/components/PromptInput.tsx`, `src/App.tsx`, `src/hooks/`, `src/utils/`. 순수 함수는 `server/index.ts`(부수효과: `Bun.serve`)에 두지 말고 `generator.ts`/`fallback.ts`로 분리해 테스트한다 (`server/generator.ts:1-2` 주석).
- 테스트 없는 곳: `server/index.ts`의 HTTP 핸들러, `LivePreview`. 이 영역을 수정하면 수동 확인(`bun run dev`)이 필요하다.
- 테스트 파일은 소스 옆에 `*.test.ts(x)`로 둔다 (`vite.config.ts` include 패턴: `src/**`, `server/**`).

## Project Context

- React 컴포넌트를 AI로 생성하고 실시간 미리보기·코드 보기를 제공하는 도구.
- Stack: React 19, TypeScript, Vite, Bun(API 프록시), react-live, vitest, Testing Library.
- 프로젝트 소개·실행법은 `README.md` 참조.

## Context Map

- **[프론트엔드 수정 (React/Vite)](./src/AGENTS.md)** — 컴포넌트, 훅, 타입, 프론트 테스트 작업 시.
- **[API 서버 수정 (Bun)](./server/AGENTS.md)** — 프로바이더 호출, 프롬프트, 후처리 로직 작업 시.

## Standards & References

- 커밋: `<type>: <한국어 요약>` (feat/fix/refactor/chore). 커밋 스킬: `.claude/skills/commit/SKILL.md`.
- 사용자 대상 문구와 코드 주석은 한국어로 작성한다 (기존 코드 관례).
- Maintenance Policy: 이 문서의 규칙이 코드와 어긋나면(파일·라인 이동 포함) 작업 중 업데이트를 제안하라.
