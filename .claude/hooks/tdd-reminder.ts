// PreToolUse(Write|Edit) 훅: .ts/.tsx 파일을 생성·수정하기 전에 TDD 규칙을 에이전트에게 다시 상기시킨다.
// 규칙 원문: .claude/rules/tdd.md

const REMINDER = `[TDD 리마인더] .ts/.tsx 파일을 작성·수정하려 합니다. .claude/rules/tdd.md(Rigid)를 지키고 있는지 먼저 확인하세요.
1. 이 변경이 TDD 대상인가? (비즈니스 로직·API·유틸·버그 수정은 대상. 타입 정의·설정·순수 UI는 제외. 애매하면 대상.)
2. RED: 실패하는 테스트를 먼저 작성하고 실제로 실행해 "기능 미구현" 이유로 실패하는 것을 확인했는가? (하나의 동작 = 하나의 테스트)
3. GREEN: 테스트를 통과시키는 최소한의 코드만 작성하는가? (YAGNI, 테스트를 약화하지 않기)
4. 테스트보다 프로덕션 코드를 먼저 작성했다면 그 코드를 삭제하고 RED부터 다시 시작해야 합니다.
5. REFACTOR: 모든 테스트가 green인 상태에서 새 동작 없이 정리만 하는가?
해당 단계를 아직 거치지 않았다면 이 편집을 멈추고 테스트부터 작성하세요.`;

const input = JSON.parse(await Bun.stdin.text());
const filePath: string = input?.tool_input?.file_path ?? "";

if (/\.tsx?$/.test(filePath)) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: REMINDER,
      },
    }),
  );
}
