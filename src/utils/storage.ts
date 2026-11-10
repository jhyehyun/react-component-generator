export const STORAGE_KEYS = {
  apiKey: 'rcg:apiKey',
  provider: 'rcg:provider',
  history: 'rcg:history',
  components: 'rcg:components',
} as const;

/** localStorage에서 JSON 값을 읽는다. 없거나 깨졌거나 revive가 실패하면 fallback을 반환한다. */
export function loadStored<T>(key: string, fallback: T, revive?: (raw: unknown) => T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return fallback;
    const parsed: unknown = JSON.parse(item);
    return revive ? revive(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

/** localStorage에 JSON으로 저장한다. 용량 초과·접근 차단 시에도 예외를 던지지 않는다. */
export function saveStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 기능에 영향을 주지 않으므로 무시한다.
  }
}
