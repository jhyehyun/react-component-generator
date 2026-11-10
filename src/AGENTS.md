# src/AGENTS.md

## Module Context

Vite + React 19 프론트엔드. 서버와는 `/api/generate`, `/api/config`로만 통신하며(`useComponentGenerator.ts:43`, `App.tsx:25`), 서버 코드를 직접 import하지 않는다.

## Tech Stack & Constraints

- `verbatimModuleSyntax` 활성: 타입은 반드시 `import type`으로 가져온다 (`tsconfig.app.json`, 예: `ComponentCard.tsx:2`).
- `erasableSyntaxOnly` 활성: `enum`, `namespace`, 생성자 parameter property를 쓰지 마라. 유니온 리터럴 타입을 쓴다 (`types/index.ts:1`).
- `noUnusedLocals`/`noUnusedParameters` 활성: 미사용 변수는 빌드(`tsc -b`)를 깨뜨린다.
- 스타일은 클래스 기반 CSS(`App.css`, `index.css`)다. 인라인 style 객체는 AI 생성 코드 전용이며 앱 UI에는 쓰지 않는다.
- 상태 관리 라이브러리 없이 `useState`와 훅으로 구성한다. 서버 통신은 `fetch`만 사용한다.

## Implementation Patterns

- 컴포넌트는 named export(`export function X`), `App`만 default export. props 인터페이스는 같은 파일 상단에 `XProps`로 선언한다.
- 서버 호출·비동기 상태는 `hooks/useComponentGenerator.ts`에 모으고, 컴포넌트는 콜백 props로만 받는다.
- 공용 타입은 `types/index.ts`에 둔다.
- 창 형태 UI는 `win` / `win-title` / `win-body` 클래스 구조를 따른다 (`App.tsx:68-74`, `ComponentCard.tsx:296-297`). 새 패널도 같은 구조를 재사용한다.
- 사용자 대상 문구는 한국어, 접근성 속성(`aria-label`, `role`)을 유지한다.

## Testing Strategy

- 실행: `bunx vitest run src`
- 패턴: Testing Library + `userEvent`, 접근성 role/name으로 요소를 찾는다(`getByRole('button', { name })`, `PromptInput.test.tsx`). 케이스명은 한국어.
- 정리(cleanup)는 `src/test/setup.ts`가 처리하므로 테스트에서 중복 호출하지 마라.
- 테스트가 없는 `ComponentCard`, `CodeView`, `LivePreview`를 수정하면 `bun run dev`로 수동 확인한다.
- `src/test/setup.ts`가 테스트마다 `localStorage.clear()`를 하므로, 영속화 테스트는 `STORAGE_KEYS`로 직접 값을 심어 복원을 검증한다.

## Local Golden Rules

- Do: 미리보기 새로고침은 `LivePreview`의 `key`를 바꿔 리마운트하는 방식이다 (`ComponentCard.tsx:289,346`). 상태 초기화가 필요한 미리보기 변경도 이 방식을 유지한다.
- Do: 생성·재생성은 반드시 `App`의 `handleGenerate`를 거친다 (`App.tsx:33-39`, `:185`에서 `onRegenerate`로 전달). 여기서 API 키/환경 키 유무를 검사하므로, 훅의 `generate`를 컴포넌트에서 직접 호출해 우회하지 마라.
- Do: Provider 변경 시 입력된 키를 비운다 (`App.tsx:41-44`). 프로바이더 간 키가 섞여 전송되는 것을 막는 동작이므로 유지한다.
- Don't: `apiKey`를 쿼리스트링·로그에 남기지 마라. 브라우저 저장은 `usePersistedState(STORAGE_KEYS.apiKey)` 한 곳에서만 한다.
- Do: 새 영속 상태는 `STORAGE_KEYS`에 키를 추가하고 `usePersistedState`를 쓴다. localStorage를 컴포넌트에서 직접 읽고 쓰지 마라. 저장 데이터는 신뢰하지 말고 `revive`로 검증하며(`App.tsx`의 `reviveProvider`, `reviveHistory`), 잘못된 값이면 예외를 던져 기본값으로 돌린다.
- Do: 저장된 `GeneratedComponent.createdAt`은 JSON에서 문자열이 되므로 복원 시 `Date`로 되돌린다 (`useComponentGenerator.ts`의 `reviveComponents`).
- Don't: `Provider` 타입을 바꿀 때 `types/index.ts:1`만 수정하지 마라. 같은 유니온이 `server/index.ts:57`에 별도로 정의돼 있어 두 곳을 함께 수정해야 하고, `App.tsx:8-11`의 `PROVIDER_CONFIG`도 맞춰야 한다.
- Don't: `LivePreview`에 `noInline`을 제거하지 마라 (`LivePreview.tsx:11`). 서버가 생성하는 `render()` 호출 방식과 짝이다.
