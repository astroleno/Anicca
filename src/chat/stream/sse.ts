// 占位：若未来接入流式 SSE/分片增量，统一在此解析
// 目前使用 MockProvider，直接返回整段文本，不启用 SSE

export type StreamChunk = { type: 'text'; delta: string };

export type StreamHandler = {
  onStart?: () => void;
  onChunk?: (c: StreamChunk) => void;
  onEnd?: (finalText: string) => void;
  onError?: (e: any) => void;
};


