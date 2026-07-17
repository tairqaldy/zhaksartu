"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatMode, type ChatModeState } from "@/lib/useChatMode";

type Mode = "build" | "roast" | "market";
type BuildPhase = "idea" | "questions" | "output";

type ClaudeTier = { id: string; label: string; model: string; note: string };

type Health = {
  claude: boolean;
  claudeTiers: ClaudeTier[];
};

type Extra = { q: string; hint?: string };

type HistoryEntry = {
  id: string;
  at: string;
  mode: string;
  engine: string;
  idea: string;
  output: string;
};

const SKELETON = [
  {
    key: "goal",
    num: "01",
    label: "Goal & outcome",
    hint: "What does done look like? Who is it for (often: just me)?",
  },
  {
    key: "scope",
    num: "02",
    label: "Scope & size",
    hint: "Quick hack / weekend project / real product. What's deliberately out of scope?",
  },
  {
    key: "design",
    num: "03",
    label: "Design direction",
    hint: "Leave empty to use your profile's design language as-is. Paste reference links if any.",
  },
  {
    key: "tech",
    num: "04",
    label: "Tech stack & versions",
    hint: "Frameworks + exact versions to pin, package manager, hosting, DB. Things AIs get wrong about this stack.",
  },
  {
    key: "constraints",
    num: "05",
    label: "Constraints & non-goals",
    hint: "What must the builder AI NOT do?",
  },
] as const;

const REAL_MODES: { id: Mode; label: string }[] = [
  { id: "build", label: "build" },
  { id: "roast", label: "roast" },
  { id: "market", label: "market" },
];
const GHOST_MODES = ["storytelling"] as const;

const DOC_CHECK_TEXT =
  "Instruct the builder AI to consult current documentation (context7, node_modules docs, official changelogs) for exact API shapes and versions instead of trusting its training data, and to say so when docs contradict its assumptions.";

const DEFAULT_TIER = "sonnet";

export default function Home() {
  const [mode, setMode] = useState<Mode>("build");
  const [claudeTier, setClaudeTier] = useState(DEFAULT_TIER);
  const [health, setHealth] = useState<Health | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [profile, setProfile] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (res.ok) setHistory((await res.json()).history ?? []);
    } catch {
      /* non-fatal */
    }
  }, []);

  // ── Build mode state ──────────────────────────────────────
  const [phase, setPhase] = useState<BuildPhase>("idea");
  const [idea, setIdea] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [docCheck, setDocCheck] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastTier, setLastTier] = useState(DEFAULT_TIER);

  // ── Chat modes ────────────────────────────────────────────
  const roast = useChatMode("roast", claudeTier, refreshHistory);
  const market = useChatMode("market", claudeTier, refreshHistory);

  const refreshHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) setHealth(await res.json());
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    refreshHealth();
    refreshHistory();
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setProfile(d.profile ?? ""))
      .catch(() => {});
  }, [refreshHealth, refreshHistory]);

  // ── Build mode logic ──────────────────────────────────────

  async function goQuestions() {
    if (idea.trim().length < 3) return;
    setLoadingQuestions(true);
    setExtras([]);
    setPhase("questions");
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, model: claudeTier }),
      });
      if (res.ok) setExtras((await res.json()).questions ?? []);
    } catch {
      /* extras are optional */
    } finally {
      setLoadingQuestions(false);
    }
  }

  function collectAnswers() {
    const list: { label: string; value: string }[] = SKELETON.map((s) => ({
      label: s.label,
      value: answers[s.key] ?? "",
    }));
    if (docCheck) {
      list.push({ label: "Doc discipline", value: DOC_CHECK_TEXT });
    }
    extras.forEach((x, i) => {
      list.push({ label: x.q, value: answers[`extra_${i}`] ?? "" });
    });
    return list;
  }

  async function runEnhance(withTier: string) {
    if (
      output.trim().length > 0 &&
      !window.confirm(
        "This replaces the prompt on screen with a new one. (The current one is already saved in history — open the profile panel to find it.) Continue?"
      )
    ) {
      return;
    }
    setPhase("output");
    setOutput("");
    setCopied(false);
    setStreaming(true);
    setWaiting(true);
    setLastTier(withTier);
    let text = "";
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, answers: collectAnswers(), model: withTier }),
      });
      if (!res.ok || !res.body) {
        text = `[zhaksartu error] ${await res.text()}`;
        setOutput(text);
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
          setOutput(text);
        }
      }
      if (text.trim() && !text.startsWith("[zhaksartu error]")) {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "build", engine: withTier, idea, output: text }),
        });
        refreshHistory();
      }
    } catch (err) {
      setOutput(
        text +
          `\n\n[zhaksartu error] ${err instanceof Error ? err.message : "request failed"}`
      );
    } finally {
      setStreaming(false);
      setWaiting(false);
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Shared ────────────────────────────────────────────────

  async function saveProfile() {
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    setProfileDirty(false);
  }

  async function deleteHistory(id: string) {
    await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    refreshHistory();
  }

  function startOver() {
    setPhase("idea");
    setIdea("");
    setExtras([]);
    setAnswers({});
    setOutput("");
    roast.reset();
    market.reset();
  }

  const lastModelLabel =
    health?.claudeTiers.find((t) => t.id === lastTier)?.model ?? lastTier;
  const currentModel = health?.claudeTiers.find((t) => t.id === claudeTier)?.model;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-24">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="flex items-baseline justify-between border-b border-hairline py-5">
        <div>
          <button
            onClick={startOver}
            className="font-serif text-2xl text-ink"
            title="Start over"
          >
            zhaksartu
          </button>
          <span className="ml-3 text-xs text-ink-muted">
            жақсарту · to improve
          </span>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="rounded-[2px] border border-hairline px-3 py-1.5 text-xs text-ink transition-colors hover:border-navy"
        >
          profile
        </button>
      </header>

      {/* ── Model picker ────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(health?.claudeTiers ?? []).map((t) => (
          <button
            key={t.id}
            onClick={() => setClaudeTier(t.id)}
            title={t.note}
            className={`rounded-[2px] border px-2.5 py-1 font-mono text-xs transition-colors ${
              claudeTier === t.id
                ? "border-navy bg-navy text-paper"
                : "border-hairline text-ink-muted hover:border-navy hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Modes ───────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-2">
        {REAL_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-[2px] px-2.5 py-1 font-mono text-xs transition-colors ${
              mode === m.id
                ? "bg-navy text-paper"
                : "border border-hairline text-ink-muted hover:border-navy hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        ))}
        {GHOST_MODES.map((m) => (
          <span
            key={m}
            title="Planned mode — visible so it isn't forgotten, costs nothing until built."
            className="cursor-not-allowed rounded-[2px] border border-hairline px-2.5 py-1 font-mono text-xs text-ink-muted opacity-50"
          >
            {m}
          </span>
        ))}
      </div>

      {/* ═══════════════════ BUILD MODE ═══════════════════════ */}
      {mode === "build" && phase === "idea" && (
        <main className="mt-10">
          <h1 className="font-serif text-3xl leading-snug text-ink">
            Paste your raw idea.{" "}
            <em className="text-ink-muted">Messy is fine.</em>
          </h1>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={8}
            autoFocus
            placeholder="e.g. i want a tiny site that tracks my books and nags me when i stall on one…"
            className="mt-6 w-full resize-y rounded-[2px] border border-hairline bg-paper-2 p-4 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:border-navy"
          />
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-ink-muted">
              Text only. Next: a few sharp questions.
            </p>
            <button
              onClick={goQuestions}
              disabled={idea.trim().length < 3}
              className="rounded-[2px] bg-navy px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-navy-hover disabled:opacity-40"
            >
              Enhance →
            </button>
          </div>
        </main>
      )}

      {mode === "build" && phase === "questions" && (
        <main className="mt-10">
          <h1 className="font-serif text-3xl text-ink">Sharpen it.</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Skip anything — unanswered questions become explicit open
            decisions in the prompt, never invented answers.
          </p>

          <div className="mt-8 space-y-7">
            {SKELETON.map((s) => (
              <QuestionField
                key={s.key}
                num={s.num}
                label={s.label}
                hint={s.hint}
                value={answers[s.key] ?? ""}
                onChange={(v) => setAnswers((a) => ({ ...a, [s.key]: v }))}
              >
                {s.key === "tech" && (
                  <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={docCheck}
                      onChange={(e) => setDocCheck(e.target.checked)}
                      className="mt-0.5 accent-[#001a55]"
                    />
                    Tell the builder AI to consult current docs (context7 /
                    node_modules) instead of trusting training data
                  </label>
                )}
              </QuestionField>
            ))}

            {loadingQuestions && (
              <p className="animate-pulse-soft font-mono text-xs text-ink-muted">
                thinking of idea-specific questions…
              </p>
            )}

            {extras.map((x, i) => (
              <QuestionField
                key={`extra_${i}`}
                num={String(6 + i).padStart(2, "0")}
                label={x.q}
                hint={x.hint ?? ""}
                value={answers[`extra_${i}`] ?? ""}
                onChange={(v) =>
                  setAnswers((a) => ({ ...a, [`extra_${i}`]: v }))
                }
              />
            ))}
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-hairline pt-5">
            <button
              onClick={() => setPhase("idea")}
              className="text-sm text-ink-muted hover:text-ink"
            >
              ← back to idea
            </button>
            <button
              onClick={() => runEnhance(claudeTier)}
              className="rounded-[2px] bg-navy px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-navy-hover"
            >
              Generate prompt →
            </button>
          </div>
        </main>
      )}

      {mode === "build" && phase === "output" && (
        <main className="mt-10">
          <div className="flex items-baseline justify-between">
            <h1 className="font-serif text-3xl text-ink">Your prompt.</h1>
            <span className="font-mono text-xs text-ink-muted">
              {lastModelLabel}
            </span>
          </div>

          {waiting && (
            <p className="mt-6 animate-pulse-soft font-mono text-xs text-ink-muted">
              starting…
            </p>
          )}

          <div className="relative mt-6 rounded-[4px] border border-hairline bg-paper-2 shadow-[0_24px_48px_-24px_rgba(0,26,85,0.18)]">
            <button
              onClick={copyOutput}
              disabled={!output || streaming}
              className="absolute right-3 top-3 rounded-[2px] bg-navy px-3 py-1.5 font-mono text-xs text-paper transition-colors hover:bg-navy-hover disabled:opacity-40"
            >
              {copied ? "copied ✓" : "copy"}
            </button>
            <pre className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap p-5 pr-24 font-mono text-[13px] leading-relaxed text-ink">
              {output || " "}
              {streaming && <span className="animate-pulse-soft">▌</span>}
            </pre>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => runEnhance(lastTier)}
              disabled={streaming}
              className="rounded-[2px] border border-hairline px-4 py-2 text-sm text-ink transition-colors hover:border-navy disabled:opacity-40"
            >
              Regenerate
            </button>
            <button
              onClick={() => setPhase("questions")}
              disabled={streaming}
              className="text-sm text-ink-muted hover:text-ink disabled:opacity-40"
            >
              edit answers
            </button>
            <button
              onClick={startOver}
              disabled={streaming}
              className="text-sm text-ink-muted hover:text-ink disabled:opacity-40"
            >
              start over
            </button>
          </div>
        </main>
      )}

      {/* ═══════════════════ ROAST MODE ═══════════════════════ */}
      {mode === "roast" && (
        <ChatModeView
          chat={roast}
          modelLabel={currentModel}
          title="Paste the plan."
          titleEm="Get roasted."
          subtitle="No idea is good until it's stress-tested. This finds what breaks — real weak points, actionable, not just hedging."
          placeholder="e.g. the plan I'm about to build, warts and all…"
          startCta="Roast it →"
          chatTitle="Roast."
          youLabel="you"
          aiLabel="roast"
          replyPlaceholder="Push back, answer a point, or ask it to go harder…"
          resetLabel="new roast"
          waitingLabel="roasting…"
        />
      )}

      {/* ═══════════════════ MARKET MODE ══════════════════════ */}
      {mode === "market" && (
        <ChatModeView
          chat={market}
          modelLabel={currentModel}
          title="Paste the product."
          titleEm="Get a go-to-market plan."
          subtitle="A real, specific strategy — positioning, wedge, the first channel worth betting on, and what to test cheaply before spending real money."
          placeholder="e.g. what it is, who it's for, what's been tried so far…"
          startCta="Build the plan →"
          chatTitle="Market."
          youLabel="you"
          aiLabel="market"
          replyPlaceholder="Add detail, push back, or ask for the next step…"
          resetLabel="new plan"
          waitingLabel="thinking…"
        />
      )}

      {/* ── Profile & history drawer ────────────────────────── */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20"
          onClick={() => setPanelOpen(false)}
        />
      )}
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform overflow-y-auto border-l border-hairline bg-paper p-6 transition-transform ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl text-ink">Profile</h2>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-sm text-ink-muted hover:text-ink"
          >
            close
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          Injected into every mode. Edit it and every future result fits you
          better.
        </p>
        <textarea
          value={profile}
          onChange={(e) => {
            setProfile(e.target.value);
            setProfileDirty(true);
          }}
          rows={18}
          className="mt-4 w-full resize-y rounded-[2px] border border-hairline bg-paper-2 p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-navy"
        />
        <button
          onClick={saveProfile}
          disabled={!profileDirty}
          className="mt-3 rounded-[2px] bg-navy px-4 py-2 text-sm text-paper transition-colors hover:bg-navy-hover disabled:opacity-40"
        >
          {profileDirty ? "Save profile" : "Saved"}
        </button>

        <h2 className="mt-10 border-t border-hairline pt-6 font-serif text-xl text-ink">
          History
        </h2>
        {history.length === 0 && (
          <p className="mt-2 text-xs text-ink-muted">Nothing yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {history.map((h) => (
            <li key={h.id} className="rounded-[2px] border border-hairline">
              <button
                onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                className="flex w-full items-baseline justify-between gap-3 p-3 text-left"
              >
                <span className="truncate text-xs text-ink">{h.idea}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                  {new Date(h.at).toLocaleDateString()} · {h.mode} · {h.engine}
                </span>
              </button>
              {expanded === h.id && (
                <div className="border-t border-hairline p-3">
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink">
                    {h.output}
                  </pre>
                  <div className="mt-2 flex gap-3">
                    <button
                      onClick={() => navigator.clipboard.writeText(h.output)}
                      className="font-mono text-[11px] text-navy hover:underline"
                    >
                      copy
                    </button>
                    <button
                      onClick={() => deleteHistory(h.id)}
                      className="font-mono text-[11px] text-ink-muted hover:text-ink"
                    >
                      delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function ChatModeView({
  chat,
  modelLabel,
  title,
  titleEm,
  subtitle,
  placeholder,
  startCta,
  chatTitle,
  youLabel,
  aiLabel,
  replyPlaceholder,
  resetLabel,
  waitingLabel,
}: {
  chat: ChatModeState;
  modelLabel?: string;
  title: string;
  titleEm: string;
  subtitle: string;
  placeholder: string;
  startCta: string;
  chatTitle: string;
  youLabel: string;
  aiLabel: string;
  replyPlaceholder: string;
  resetLabel: string;
  waitingLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.streamText]);

  if (chat.phase === "intro") {
    return (
      <main className="mt-10">
        <h1 className="font-serif text-3xl leading-snug text-ink">
          {title} <em className="text-ink-muted">{titleEm}</em>
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
        <textarea
          value={chat.intro}
          onChange={(e) => chat.setIntro(e.target.value)}
          rows={8}
          autoFocus
          placeholder={placeholder}
          className="mt-6 w-full resize-y rounded-[2px] border border-hairline bg-paper-2 p-4 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/60 focus:border-navy"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={chat.start}
            disabled={chat.intro.trim().length < 3}
            className="rounded-[2px] bg-navy px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-navy-hover disabled:opacity-40"
          >
            {startCta}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mt-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-3xl text-ink">{chatTitle}</h1>
        <span className="font-mono text-xs text-ink-muted">{modelLabel}</span>
      </div>

      {/* Bounded, internally-scrollable panel — the page itself stays put,
          only this panel scrolls, and it auto-scrolls to the newest turn. */}
      <div
        ref={scrollRef}
        className="mt-6 max-h-[60vh] min-h-[16rem] space-y-4 overflow-y-auto rounded-[4px] border border-hairline bg-paper p-4"
      >
        {chat.messages.map((m, i) => (
          <ChatBubble
            key={i}
            role={m.role}
            content={m.content}
            youLabel={youLabel}
            aiLabel={aiLabel}
          />
        ))}
        {chat.streaming && (
          <ChatBubble
            role="assistant"
            content={chat.waiting ? "" : chat.streamText}
            aiLabel={aiLabel}
            streaming
          />
        )}
        {chat.waiting && chat.streaming && (
          <p className="animate-pulse-soft font-mono text-xs text-ink-muted">
            {waitingLabel}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end gap-3">
        <textarea
          value={chat.input}
          onChange={(e) => chat.setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              chat.reply();
            }
          }}
          rows={2}
          disabled={chat.streaming}
          placeholder={replyPlaceholder}
          className="flex-1 resize-y rounded-[2px] border border-hairline bg-paper-2 p-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/50 focus:border-navy disabled:opacity-60"
        />
        <button
          onClick={chat.reply}
          disabled={chat.streaming || !chat.input.trim()}
          className="rounded-[2px] bg-navy px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-navy-hover disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="mt-3">
        <button
          onClick={chat.reset}
          disabled={chat.streaming}
          className="text-sm text-ink-muted hover:text-ink disabled:opacity-40"
        >
          {resetLabel}
        </button>
      </div>
    </main>
  );
}

function ChatBubble({
  role,
  content,
  youLabel = "you",
  aiLabel,
  streaming,
}: {
  role: "user" | "assistant";
  content: string;
  youLabel?: string;
  aiLabel: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`rounded-[4px] border p-4 ${
        isUser
          ? "border-hairline bg-paper"
          : "border-hairline bg-paper-2 shadow-[0_16px_32px_-20px_rgba(0,26,85,0.15)]"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">
        {isUser ? youLabel : aiLabel}
      </div>
      <div className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
        {content}
        {streaming && <span className="animate-pulse-soft">▌</span>}
      </div>
    </div>
  );
}

function QuestionField({
  num,
  label,
  hint,
  value,
  onChange,
  children,
}: {
  num: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="pt-0.5 font-mono text-xs text-ink-muted">{num}</span>
      <div className="flex-1">
        <label className="block text-sm font-medium text-ink">{label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={hint}
          className="mt-2 w-full resize-y rounded-[2px] border border-hairline bg-paper-2 p-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/50 focus:border-navy"
        />
        {children}
      </div>
    </div>
  );
}
