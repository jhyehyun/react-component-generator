import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('프롬프트가 비어 있으면 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('입력하면 버튼이 활성화되고 클릭 시 입력값으로 onGenerate가 호출된다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    const submit = screen.getByRole('button', { name: '컴포넌트 생성' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith('프로필 카드');
  });

  it('로딩 중에는 생성 버튼이 비활성이고 "생성 중..." 을 보여준다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: '생성 중...' })).toBeDisabled();
  });

  describe('프롬프트 히스토리', () => {
    it('히스토리가 없으면 최근 프롬프트 영역을 보여주지 않는다', () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      expect(screen.queryByText('최근 프롬프트')).not.toBeInTheDocument();
    });

    it('히스토리 항목을 칩으로 보여주고 클릭하면 입력창에 채운다', async () => {
      const user = userEvent.setup();
      render(
        <PromptInput onGenerate={vi.fn()} isLoading={false} history={['프로필 카드', '요금제 표']} />,
      );
      expect(screen.getByText('최근 프롬프트')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '요금제 표' }));

      expect(screen.getByRole('textbox')).toHaveValue('요금제 표');
    });
  });

  describe('길이 제한', () => {
    const typeLong = (length: number) =>
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(length) } });

    it('현재 글자 수를 "n/500" 형태로 보여준다', () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      expect(screen.getByText('0/500')).toBeInTheDocument();

      typeLong(12);
      expect(screen.getByText('12/500')).toBeInTheDocument();
    });

    it('500자까지는 에러 없이 생성 버튼이 활성이다', () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      typeLong(500);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeEnabled();
    });

    it('501자부터는 에러 메시지를 보여주고 생성 버튼이 비활성이다', () => {
      render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
      typeLong(501);

      expect(screen.getByRole('alert')).toHaveTextContent('500자 이하');
      expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
    });

    it('501자일 때 Ctrl+Enter로도 onGenerate가 호출되지 않는다', () => {
      const onGenerate = vi.fn();
      render(<PromptInput onGenerate={onGenerate} isLoading={false} />);
      typeLong(501);

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
      expect(onGenerate).not.toHaveBeenCalled();
    });
  });
});
