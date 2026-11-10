export type Provider = 'anthropic' | 'google';

// 서버가 /api/generate로 보내는 NDJSON 이벤트 (server/index.ts의 ndjsonResponse와 짝).
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; message: string };

// 생성 중인 컴포넌트. 완료되면 같은 id의 GeneratedComponent로 확정된다.
export interface StreamingComponent {
  id: string;
  prompt: string;
  code: string;
  createdAt: Date;
}

export interface GeneratedComponent {
  id: string;
  prompt: string;
  code: string;
  createdAt: Date;
}
