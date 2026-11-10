// fetch 응답 본문(NDJSON)을 줄 단위로 파싱해 이벤트로 내보낸다.
export async function* readNdjson<T = unknown>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as T;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield JSON.parse(buffer) as T;
  } finally {
    // 소비자가 중간에 멈추거나 파싱이 실패해도 본문 스트림을 닫는다.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
