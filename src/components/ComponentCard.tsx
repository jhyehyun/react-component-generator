import { useState } from 'react';
import type { GeneratedComponent } from '../types';
import { LivePreview } from './LivePreview';
import { CodeView } from './CodeView';

interface ComponentCardProps {
  component: GeneratedComponent;
  onRemove: (id: string) => void;
  onRegenerate: (prompt: string) => void;
  isLoading: boolean;
  isStreaming?: boolean;
}

type Tab = 'preview' | 'code';

export function ComponentCard({
  component,
  onRemove,
  onRegenerate,
  isLoading,
  isStreaming = false,
}: ComponentCardProps) {
  // 스트리밍 중에는 코드 탭에서 생성 과정을 보여주고, 완료되는 순간 미리보기로 전환한다.
  const [activeTab, setActiveTab] = useState<Tab>(isStreaming ? 'code' : 'preview');
  const [wasStreaming, setWasStreaming] = useState(isStreaming);
  if (wasStreaming !== isStreaming) {
    setWasStreaming(isStreaming);
    setActiveTab(isStreaming ? 'code' : 'preview');
  }
  const [previewKey, setPreviewKey] = useState(0);
  const createdAt = component.createdAt.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="win component-card">
      <div className="win-title">
        <button
          className="close-box"
          onClick={() => onRemove(component.id)}
          disabled={isStreaming}
          title="삭제"
          aria-label="삭제"
        />
        <span className="win-title-text">{component.prompt}</span>
        <time className="win-title-time">{createdAt}</time>
      </div>
      <div className="card-toolbar">
        <div className="card-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'preview'}
            className={`tab ${activeTab === 'preview' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('preview')}
            disabled={isStreaming}
          >
            미리보기
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'code'}
            className={`tab ${activeTab === 'code' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            코드
          </button>
        </div>
        <div className="card-actions">
          <button
            className="btn btn-refresh"
            onClick={() => setPreviewKey((k) => k + 1)}
            title="미리보기 새로고침"
            aria-label="미리보기 새로고침"
            disabled={isStreaming}
          >
            ↻
          </button>
          <button
            className="btn btn-regenerate"
            onClick={() => onRegenerate(component.prompt)}
            disabled={isLoading}
          >
            {isStreaming ? '생성 중...' : '재생성'}
          </button>
        </div>
      </div>
      <div className="card-content">
        {activeTab === 'preview' ? (
          <LivePreview key={previewKey} code={component.code} />
        ) : (
          <CodeView code={component.code} />
        )}
      </div>
    </article>
  );
}
