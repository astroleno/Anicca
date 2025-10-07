"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export default function ChatBox(){
  // 对话消息列表
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 当前输入
  const [input, setInput] = useState("");
  // 加载态/错误态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback(async () => {
    if (!canSend) return;
    const content = input.trim();
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      // 调用后端接口
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP_${res.status}`);
      }

      const data = await res.json();
      const reply = String(data?.reply || "");

      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (e: any) {
      console.error("ChatBox send error", e);
      setError(e?.message || "send_failed");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [canSend, input, messages]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }, [send]);

  return (
    <div style={{ position: "absolute", right: 16, bottom: 16, width: 360, maxHeight: "70vh",
      background: "rgba(20,20,25,0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 14, color: "#cbd5e1" }}>
        Anicca · Chat
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>输入一段文字，开始对话。</div>
        )}
        {messages.map((m, idx) => (
          <div key={idx} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "#334155" : "#1f2937",
            color: "#e5e7eb", padding: "8px 10px", borderRadius: 10,
            maxWidth: "85%", whiteSpace: "pre-wrap", wordBreak: "break-word"
          }}>
            {m.content}
          </div>
        ))}
        {!!error && (
          <div style={{ color: "#f87171", fontSize: 12 }}>错误：{error}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <input
          ref={inputRef}
          style={{ flex: 1, background: "#0b1220", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px", outline: "none" }}
          value={input}
          placeholder={loading ? "生成中…" : "输入消息并回车"}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={!canSend}
          style={{ background: canSend ? "#4f46e5" : "#334155", color: "white", border: "none", borderRadius: 8, padding: "0 14px", cursor: canSend ? "pointer" : "not-allowed" }}
        >
          {loading ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}


