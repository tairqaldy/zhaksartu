"use client";

import { useState } from "react";

export type ChatMsg = { role: "user" | "assistant"; content: string };

function buildTranscript(msgs: ChatMsg[]): string {
  return msgs
    .map((m) => `${m.role === "user" ? "YOU" : "AI"}: ${m.content}`)
    .join("\n\n");
}

/**
 * Shared logic for any chat-shaped mode (roast, market, ...): a growing
 * multi-turn conversation against /api/chat, auto-saved to history as it
 * grows (create on the first exchange, upsert on every one after).
 */
export function useChatMode(persona: string, claudeTier: string, onSaved?: () => void) {
  const [phase, setPhase] = useState<"intro" | "chat">("intro");
  const [intro, setIntro] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  async function send(userText: string) {
    if (!userText.trim() || streaming) return;
    const withUser: ChatMsg[] = [...messages, { role: "user", content: userText }];
    setMessages(withUser);
    setPhase("chat");
    setStreamText("");
    setStreaming(true);
    setWaiting(true);
    let text = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, messages: withUser, model: claudeTier }),
      });
      if (!res.ok || !res.body) {
        text = `[zhaksartu error] ${await res.text()}`;
        setMessages([...withUser, { role: "assistant", content: text }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setWaiting(false);
          text += chunk;
          setStreamText(text);
        }
      }
      const finalMsgs: ChatMsg[] = [...withUser, { role: "assistant", content: text }];
      setMessages(finalMsgs);
      setStreamText("");

      if (text.trim() && !text.startsWith("[zhaksartu error]")) {
        const transcript = buildTranscript(finalMsgs);
        if (!historyId) {
          const r = await fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: persona,
              engine: claudeTier,
              idea: finalMsgs[0].content,
              output: transcript,
            }),
          });
          if (r.ok) setHistoryId((await r.json()).entry.id);
        } else {
          await fetch("/api/history", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: historyId, output: transcript }),
          });
        }
        onSaved?.();
      }
    } catch (err) {
      setMessages([
        ...withUser,
        {
          role: "assistant",
          content: `[zhaksartu error] ${err instanceof Error ? err.message : "request failed"}`,
        },
      ]);
    } finally {
      setStreaming(false);
      setWaiting(false);
    }
  }

  function start() {
    if (intro.trim().length < 3) return;
    void send(intro);
    setIntro("");
  }

  function reply() {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    void send(text);
  }

  function reset() {
    setPhase("intro");
    setIntro("");
    setMessages([]);
    setStreamText("");
    setHistoryId(null);
    setInput("");
  }

  return {
    phase,
    intro,
    setIntro,
    messages,
    streamText,
    streaming,
    waiting,
    input,
    setInput,
    start,
    reply,
    reset,
  };
}

export type ChatModeState = ReturnType<typeof useChatMode>;
