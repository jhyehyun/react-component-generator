export const MAX_PROMPT_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  length: number;
  error?: string;
}

/** 프롬프트 길이를 검증한다. 전송 시 trim되므로 앞뒤 공백은 길이에서 제외한다. */
export function validatePrompt(prompt: string): PromptValidation {
  const length = prompt.trim().length;

  if (length > MAX_PROMPT_LENGTH) {
    return {
      valid: false,
      length,
      error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.`,
    };
  }

  return { valid: true, length };
}
