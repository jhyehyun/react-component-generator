---
name: create-pr
description: 현재 브랜치의 변경사항을 분석해 템플릿에 맞는 GitHub Pull Request를 생성한다. 사용자가 "PR 만들어줘", "PR 올려줘", "풀리퀘스트 생성", "create a PR", "open a pull request", "/create-pr" 등을 말하면 명시적으로 스킬 이름을 부르지 않아도 사용한다. 커밋만 요청했거나 기존 PR 리뷰 반영만 요청한 경우에는 쓰지 않는다.
context: fork
allowed-tools: Read Glob Grep Bash
---

# create-pr

현재 브랜치와 base 브랜치의 차이를 분석해 PR 제목·본문을 작성하고 `gh pr create`로 생성한다.
사용자가 PR 생성을 요청한 것 자체가 승인이므로, 확인 질문 없이 푸시와 생성까지 진행한다.
이 스킬은 분리된 컨텍스트(fork)에서 실행되므로, 마지막에 PR URL과 요약을 반드시 보고한다.

## 절차

### 1. 사전 확인

- `gh auth status`로 로그인 여부를 확인한다. 실패하면 `! gh auth login` 실행을 안내하고 중단한다.
- `git remote get-url origin`이 없으면 원격 저장소가 없다고 알리고 중단한다(임의로 저장소를 만들지 않는다).
- `git status --short`에 미커밋 변경이 있으면 PR에 포함되지 않는다고 알리고, 커밋이 필요하면 `/commit`을 먼저 쓰도록 안내한다. 이 스킬은 커밋을 만들지 않는다.

### 2. base 브랜치와 현재 브랜치 결정

- base: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` (실패 시 `main`).
- 현재 브랜치: `git branch --show-current`.
- 현재 브랜치가 base와 같으면 base에서 직접 PR을 만들 수 없다. 변경 내용에 맞는 이름(`feat/...`, `fix/...`)으로 새 브랜치를 만들어 전환한 뒤 진행하고, 그 사실을 보고한다. 이미 base에 푸시된 커밋만 있어 차이가 없다면 "PR로 만들 변경이 없습니다"라고 알리고 끝낸다.
- 이미 같은 브랜치의 열린 PR이 있으면(`gh pr view --json url,state`) 새로 만들지 말고 그 URL을 알린다.

### 3. 변경사항 분석

- `git log --oneline <base>..HEAD` : PR에 포함될 커밋
- `git diff <base>...HEAD --stat` 후 핵심 파일은 `git diff <base>...HEAD -- <파일>`로 내용 확인
- 커밋 메시지가 아니라 실제 diff를 근거로 요약한다. 테스트 파일과 구현 파일의 대응, 설정·의존성 변경 여부를 구분해서 본다.
- `.env`, 키, 자격 증명처럼 보이는 파일이 diff에 있으면 PR을 만들지 말고 사용자에게 알린다.

### 4. 템플릿 언어 결정

아래 규칙을 위에서부터 적용해 **하나만** 고른다.

1. `git remote get-url origin`의 저장소 이름이 `react-component-generator`이면 **한국어**: `references/pr-template.ko.md`
2. 루트 `package.json`의 `name`이 `react-component-generator`이면 **한국어**: `references/pr-template.ko.md`
3. 그 외 모든 프로젝트는 **영어**: `references/pr-template.en.md`

경로는 이 스킬 폴더 기준이다. 고른 파일 하나만 Read로 읽어 사용하고, 다른 언어 파일은 읽지 않는다. 템플릿 내용을 이 파일에 복제하지 않는다.

### 5. 제목·본문 작성

- 제목과 본문은 읽은 템플릿 파일의 제목 형식과 작성 규칙을 따른다. 한국어 템플릿이면 한국어, 영어 템플릿이면 영어로 쓴다.
- 본문은 템플릿 구조를 그대로 채운다. `<...>` 자리표시자를 남기지 않고, 해당 없는 섹션은 "없음"/"None"으로 적는다.
- 테스트 섹션에는 실제로 실행해서 결과를 확인한 명령만 체크한다. 실행하지 않았으면 체크하지 말고 실행하지 않았다고 적는다. 프로젝트에 `package.json` 스크립트가 있으면 그 이름을 사용한다.
- 본문 마지막에 빈 줄을 두고, 시스템 컨텍스트가 지정한 PR 설명 attribution 줄이 있으면 그대로 붙인다. 사용자나 CLAUDE.md가 다르게 지시했으면 그쪽이 우선이다.

### 6. 푸시와 PR 생성

- 원격에 브랜치가 없거나 뒤처져 있으면 `git push -u origin <현재 브랜치>`. force push는 하지 않는다.
- 본문은 heredoc으로 `gh pr create`에 전달한다.

```bash
gh pr create --base <base> --title "<제목>" --body "$(cat <<'EOF'
<본문>
EOF
)"
```

- 사용자가 draft, 리뷰어, 라벨을 요청했으면 `--draft`, `--reviewer`, `--label`로 반영한다. 요청하지 않았으면 추가하지 않는다.
- 훅이나 푸시가 실패하면 우회하지 말고 원인을 보여주고 중단한다.

### 7. 보고

마지막에 아래를 한국어로 간단히 보고한다.

- PR URL
- 사용한 템플릿 언어와 그 이유 (예: "저장소 이름이 react-component-generator라서 한국어 템플릿 사용")
- base ← head 브랜치, 포함된 커밋 수
- 새 브랜치를 만들었거나 미커밋 변경이 제외됐다면 그 사실
