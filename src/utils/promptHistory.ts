export const MAX_HISTORY = 20;

/** 프롬프트를 히스토리 맨 앞에 추가한다. 공백은 제거하고 중복은 앞으로 옮기며 최대 개수를 유지한다. */
export function addToHistory(history: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
}
