type Listener = (...args: any[]) => void;

const listeners: Record<string, Set<Listener>> = {};

export function on(event: string, fn: Listener) {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(fn);
  return () => off(event, fn);
}

export function off(event: string, fn: Listener) {
  listeners[event]?.delete(fn);
}

export function emit(event: string, ...args: any[]) {
  listeners[event]?.forEach(fn => {
    try { fn(...args); } catch (e) { console.error("event listener error", e); }
  });
}

// 语义化事件名（可按需扩展）
export const Events = {
  NodeHover: "NodeHover",
  Merge: "Merge",
  RerunStart: "RerunStart",
  RerunEnd: "RerunEnd"
} as const;


