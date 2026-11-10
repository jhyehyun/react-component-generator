import { useState, useCallback } from 'react';
import type { GeneratedComponent, Provider, StreamEvent, StreamingComponent } from '../types';
import { usePersistedState } from './usePersistedState';
import { STORAGE_KEYS } from '../utils/storage';
import { readNdjson } from '../utils/readNdjson';

// 저장된 JSON에서 createdAt을 Date로 되돌린다. 배열이 아니면 예외를 던져 fallback을 쓰게 한다.
function reviveComponents(raw: unknown): GeneratedComponent[] {
  if (!Array.isArray(raw)) throw new Error('invalid components');
  return raw.map((item) => ({ ...item, createdAt: new Date(item.createdAt) }));
}

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  streaming: StreamingComponent | null;
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = usePersistedState<GeneratedComponent[]>(
    STORAGE_KEYS.components,
    [],
    reviveComponents,
  );
  const [streaming, setStreaming] = useState<StreamingComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date();
    setStreaming({ id, prompt, code: '', createdAt });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      let finalCode: string | null = null;
      for await (const event of readNdjson<StreamEvent>(res.body!)) {
        if (event.type === 'delta') {
          setStreaming((prev) => prev && { ...prev, code: prev.code + event.text });
        } else if (event.type === 'error') {
          throw new Error(event.message);
        } else if (event.type === 'done') {
          finalCode = event.code;
        }
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      if (!finalCode.trim()) {
        throw new Error('생성된 코드가 비어 있습니다. 다시 시도해주세요.');
      }

      setComponents((prev) => [{ id, prompt, code: finalCode, createdAt }, ...prev]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setStreaming(null);
      setIsLoading(false);
    }
  }, [setComponents]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, streaming, isLoading, error, generate, removeComponent, clearAll };
}
