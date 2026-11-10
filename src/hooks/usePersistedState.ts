import { useState, useEffect } from 'react';
import { loadStored, saveStored } from '../utils/storage';

/** useState와 같지만 값을 localStorage에 저장하고 마운트 시 복원한다. */
export function usePersistedState<T>(key: string, initial: T, revive?: (raw: unknown) => T) {
  const [state, setState] = useState<T>(() => loadStored(key, initial, revive));

  useEffect(() => {
    saveStored(key, state);
  }, [key, state]);

  return [state, setState] as const;
}
