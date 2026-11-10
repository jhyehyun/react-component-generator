import { useState, useEffect } from 'react';
import { usePersistedState } from './hooks/usePersistedState';
import { STORAGE_KEYS } from './utils/storage';
import { addToHistory } from './utils/promptHistory';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import type { Provider } from './types';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

// 저장된 값이 유효하지 않으면 예외를 던져 loadStored가 기본값을 쓰게 한다.
function reviveProvider(raw: unknown): Provider {
  if (typeof raw === 'string' && raw in PROVIDER_CONFIG) return raw as Provider;
  throw new Error('invalid provider');
}

function reviveHistory(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) return raw;
  throw new Error('invalid history');
}

function App() {
  const [apiKey, setApiKey] = usePersistedState(STORAGE_KEYS.apiKey, '');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = usePersistedState<Provider>(
    STORAGE_KEYS.provider,
    'google',
    reviveProvider,
  );
  const [history, setHistory] = usePersistedState<string[]>(STORAGE_KEYS.history, [], reviveHistory);
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const { components, isLoading, error, generate, removeComponent, clearAll } =
    useComponentGenerator();

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    setHistory((prev) => addToHistory(prev, prompt));
    generate(prompt, apiKey || undefined, provider);
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey('');
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <>
      <header className="menubar">
        <div className="menubar-brand">
          <span className="brand-mark" aria-hidden="true">RC</span>
          <span>React 컴포넌트 생성기</span>
        </div>
        <div className="menubar-status" aria-label="현재 작업 상태">
          <span>모델 제공자: {activeProvider}</span>
          <span>컴포넌트 {components.length}개</span>
        </div>
      </header>

      <div className="app">
      <div className="desk-heading">
        <h1>프롬프트로 만드는 UI 워크벤치</h1>
        <p>요청을 입력하면 React 컴포넌트가 창으로 열립니다. 바로 미리보고, 코드로 확인하세요.</p>
      </div>

      <main className="workspace">
        <section className="win composer-panel" aria-label="컴포넌트 생성">
          <div className="win-title">
            <span className="win-title-text">새 컴포넌트</span>
          </div>
          <div className="win-body">
            <PromptInput onGenerate={handleGenerate} isLoading={isLoading} history={history} />
          </div>
        </section>

        <aside className="win settings-panel" aria-label="실행 설정">
          <div className="win-title">
            <span className="win-title-text">실행 설정</span>
          </div>
          <div className="win-body">
          <div className="provider-select">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="api-key-input">
            <label htmlFor="api-key">
              API Key
            </label>
            <div className="api-key-field">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasEnvKey
                    ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                    : PROVIDER_CONFIG[provider].placeholder
                }
              />
              <button
                className="btn btn-toggle-key"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? '숨기기' : '보기'}
              </button>
            </div>
            <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
              {hasEnvKey ? '.env 키가 연결되어 있습니다.' : '직접 입력하거나 서버 환경변수를 설정하세요.'}
            </p>
          </div>
          </div>
        </aside>
      </main>

      {error && (
        <div className="win error-banner" role="alert">
          <div className="win-title win-title--alert">
            <span className="win-title-text">오류</span>
          </div>
          <div className="win-body">
            <span className="error-icon" aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="results-section" aria-label="생성된 컴포넌트">
        {components.length > 0 && (
          <div className="results-header">
            <h2>생성된 컴포넌트 {components.length}개</h2>
            <button className="btn btn-clear" onClick={clearAll}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <div className="win empty-state">
            <div className="win-title">
              <span className="win-title-text">빈 폴더</span>
            </div>
            <div className="win-body">
              <div className="empty-folder" aria-hidden="true" />
              <div className="empty-copy">
                <h2>아직 만든 컴포넌트가 없어요.</h2>
                <p>위 입력창에 원하는 UI를 설명하거나, 예시 프롬프트를 눌러 시작하세요.</p>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="win loading-card" role="status">
            <div className="win-title">
              <span className="win-title-text">생성 중</span>
            </div>
            <div className="win-body">
              <p>컴포넌트를 만들고 있습니다. 잠시만 기다려주세요.</p>
              <div className="progress" aria-hidden="true">
                <div className="progress-fill" />
              </div>
            </div>
          </div>
        )}

        <div className="results-grid">
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
            />
          ))}
        </div>
      </section>
      </div>
    </>
  );
}

export default App;
