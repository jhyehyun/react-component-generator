import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

const component: GeneratedComponent = {
  id: '1',
  prompt: '카드',
  code: 'const A = () => <div>hi</div>;\nrender(<A />);',
  createdAt: new Date(),
};

const renderCard = (isStreaming: boolean) => (
  <ComponentCard
    component={component}
    onRemove={vi.fn()}
    onRegenerate={vi.fn()}
    isLoading={isStreaming}
    isStreaming={isStreaming}
  />
);

describe('ComponentCard 스트리밍', () => {
  it('스트리밍 중에는 코드 탭이 선택되어 있다', () => {
    render(renderCard(true));
    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');
  });

  it('스트리밍 중에는 미리보기 탭을 누를 수 없다', () => {
    render(renderCard(true));
    expect(screen.getByRole('tab', { name: '미리보기' })).toBeDisabled();
  });

  it('스트리밍이 끝나면 미리보기 탭으로 전환한다', () => {
    const { rerender } = render(renderCard(true));
    rerender(renderCard(false));
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });

  it('스트리밍 중이 아니면 처음부터 미리보기 탭이 선택되어 있다', () => {
    render(renderCard(false));
    expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true');
  });
});
