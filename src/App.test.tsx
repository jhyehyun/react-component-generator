import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STORAGE_KEYS } from './utils/storage';

const CODE = 'const A = () => <div>hi</div>;\nrender(<A />);';

const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

describe('App 상태 영속화', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/config'
          ? new Response(JSON.stringify({ envKeys: { anthropic: false, google: false } }))
          : new Response(`${JSON.stringify({ type: 'done', code: CODE })}\n`),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('저장된 Provider와 API 키를 복원한다', () => {
    localStorage.setItem(STORAGE_KEYS.provider, JSON.stringify('anthropic'));
    localStorage.setItem(STORAGE_KEYS.apiKey, JSON.stringify('sk-ant-test'));

    render(<App />);

    expect(screen.getByLabelText('Provider')).toHaveValue('anthropic');
    expect(screen.getByLabelText('API Key')).toHaveValue('sk-ant-test');
  });

  it('저장된 Provider가 알 수 없는 값이면 기본값(google)을 쓴다', () => {
    localStorage.setItem(STORAGE_KEYS.provider, JSON.stringify('unknown'));
    render(<App />);
    expect(screen.getByLabelText('Provider')).toHaveValue('google');
  });

  it('API 키를 입력하면 저장한다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API Key'), 'abc');

    expect(stored(STORAGE_KEYS.apiKey)).toBe('abc');
  });

  it('Provider를 바꾸면 Provider를 저장하고 입력된 키는 비운다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'abc');

    await user.selectOptions(screen.getByLabelText('Provider'), 'anthropic');

    expect(stored(STORAGE_KEYS.provider)).toBe('anthropic');
    expect(stored(STORAGE_KEYS.apiKey)).toBe('');
  });

  it('생성 후 프롬프트가 히스토리에 저장되고 새로고침 후에도 칩으로 보인다', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'abc');
    await user.type(screen.getByRole('textbox', { name: '' }), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));
    await screen.findByText('생성된 컴포넌트 1개');

    expect(stored(STORAGE_KEYS.history)).toEqual(['프로필 카드']);

    first.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: '프로필 카드' })).toBeInTheDocument();
  });

  it('생성된 컴포넌트 목록이 새로고침 후에도 유지된다', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.type(screen.getByLabelText('API Key'), 'abc');
    await user.type(screen.getByRole('textbox', { name: '' }), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));
    await screen.findByText('생성된 컴포넌트 1개');

    first.unmount();
    render(<App />);

    expect(screen.getByText('생성된 컴포넌트 1개')).toBeInTheDocument();
  });
});
