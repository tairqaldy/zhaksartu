# zhaksartu — Personal Prompt Enhancement Tool

**Status (2026-07-16, evening):** Built (Phases 0–3 code complete) and pushed to the public repo `github.com/tairqaldy/zhaksartu`. Railway + domain setup pending (documented in README). All section-8 open items resolved — see sections 8–9.

**Date:** 2026-07-16
**Scope:** New project, empty repo. A single-page web tool hosted on the user's Railway account.
**Goal:** Paste a super-raw idea → answer a short set of sharp questions → get an enhanced, personal-fit prompt (not a generalized one) ready to paste into Claude Code or another AI.

*zhaksartu* = жақсарту = "to improve" (Kazakh).

---

## 1. Product definition

> A private, single-page prompt-enhancement tool. Input is text only (no media). The output prompt is tailored to the user's known preferences (design language, implementation style, honesty rules) via a stored, editable preference profile — with a **separated tech-stack section** so the target AI never substitutes old versions or wrong tech for what was actually asked.

What it is NOT: a chat app, a multi-user product, a landing page. No marketing sections, no auth system beyond a passcode.

**Decisions locked with the user (2026-07-16):**
1. **Engine: hybrid, local-first.** Ollama running a small model on Railway (CPU) is the default engine; a Claude API toggle escalates a given enhancement to a frontier model when wanted.
2. **Scope: dev/build ideas first.** V1 is tuned for "raw app/feature idea → enhanced build prompt." The design + tech sections are always present. Architecture leaves room for other modes (writing, image prompts) later.
3. **Questions: fixed skeleton + AI extras.** Stable sections always appear; the engine adds 2–4 idea-specific questions.
4. **Access: simple passcode.** One passphrase from an env var, checked once, stored in a signed cookie. No accounts.

**Constraint discovered in research:** Railway has no GPUs. "Local model" means CPU inference — viable for small models (1B–8B) via Ollama, at roughly 5–15 tokens/sec. This is a deliberate tradeoff (privacy, flat cost, fun) accepted by the user; the Claude toggle exists precisely because the local model is the weaker writer.

---

## 2. Architecture

Two Railway services in one project, talking over Railway private networking.

### 2.1 `web` — Next.js app (UI + API)

- **Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4. Same stack as sathustle — zero learning cost.
  - Next.js 16 note carried over from sathustle: read `node_modules/next/dist/docs` (or context7) before writing route/layout code; do not trust training-data APIs.
- **API routes:**
  - `POST /api/questions` — takes the raw idea, returns 2–4 AI-generated extra questions (JSON).
  - `POST /api/enhance` — takes idea + all answers + profile, streams the enhanced prompt via SSE.
  - `GET/PUT /api/profile` — read/update the preference profile.
  - `GET /api/health` — reports which engines are up (drives the engine indicator in the UI).
- **Engine layer:** one `EnhanceEngine` interface, two implementations:
  - `OllamaEngine` (default) — plain `fetch` to `http://ollama.railway.internal:11434/api/chat` with `stream: true`.
  - `ClaudeEngine` (escalation toggle) — `@anthropic-ai/sdk`, `client.messages.stream(...)`. Toggle appears in the UI only when `ANTHROPIC_API_KEY` is set.
- **Storage:** one small Railway volume + SQLite (`better-sqlite3`): `profile` (single row of markdown) and `history` (saved enhancements). Single user — no ORM ceremony.
- **Passcode:** middleware checks a signed cookie; the gate screen posts the passphrase, compared against `PASSCODE` env var.

### 2.2 `ollama` — local model service

- Official `ollama/ollama` image. **Not exposed publicly** — private networking only.
- **Model: Qwen3.5 4B Instruct, Q4_K_M quant** — the consensus best small model for CPU-only inference in 2026. Alternatives to A/B in Phase 1: Phi-4-mini (3.8B, strong small reasoner), Gemma 3 4B. Pick by taste on real prompts, not benchmarks.
- **Volume mounted at `/root/.ollama`** so the ~2.5GB model file survives redeploys (pulled once, not on every deploy).
- **RAM:** ~4GB resident with 8K context. Set the service limit to 6GB.
- **Env:** `OLLAMA_KEEP_ALIVE=30m` (keep model hot between requests while awake).
- **App sleeping ON** (recommended): the service scales to zero when idle, so you pay only for active minutes. Cost of that: a cold start of ~15–40s while the model loads — the UI must show a friendly "waking the model…" state instead of appearing broken.

### 2.3 Model settings (the "best settings" part)

| Call | Local (Qwen3.5 4B) | Claude (escalation) |
|---|---|---|
| Question generation | `temperature 0.3`, `format: json`, `num_ctx 8192` | `claude-opus-4-8`, adaptive thinking, JSON via `output_config.format` |
| Final enhancement | `temperature 0.45`, `top_p 0.9`, `num_ctx 8192`, streamed | `claude-opus-4-8`, adaptive thinking, streamed (no temperature — the 4.8 API rejects sampling params) |

- Claude model is env-configurable (`CLAUDE_MODEL`, default `claude-opus-4-8`). Budget alternative: `claude-haiku-4-5` ($1/$5 per MTok — an enhancement costs well under a cent).
- Low temperature on question generation because we want disciplined JSON; moderate temperature on the final write because it is still a *rewriting* task, not creative writing — inventing scope is the failure mode to avoid.

---

## 3. The flow (single page, three states + profile)

```
[passcode gate] → 1. IDEA → 2. QUESTIONS → 3. ENHANCED PROMPT
                                   ↑ profile panel available from any state
```

### 3.1 Idea
One large textarea: *"Paste your raw idea. Messy is fine."* Below it: engine indicator (`local · qwen3.5-4b` / `claude`), mode label (`build` — the only mode in v1), and a single button **"Жақсарту"** (or "Enhance" — see open item 3). Submitting fires `/api/questions` and advances.

### 3.2 Questions — fixed skeleton + AI extras
Rendered as one calm vertical form. **Every question is skippable** — unanswered questions become an explicit "Open decisions" section in the output rather than the AI inventing answers. Fixed sections (mono numerals `01`–`05`, sathustle how-it-works style):

- **01 Goal & outcome** — what does done look like? Who is it for (often "just me")?
- **02 Scope & size** — quick hack / weekend project / real product; single page vs multi-screen; what's deliberately out of scope.
- **03 Design direction** — prefilled from the profile ("paper minimalism, one accent, serif display…") with an override field and space for reference links. If the user says nothing, the profile's design language is used verbatim.
- **04 Tech stack & versions** — **the separated tech section, the user's explicit ask.** Fields: framework + exact versions to pin; package manager; hosting target; database; a free field *"things AIs get wrong about this stack"*; and a default-on toggle *"instruct the target AI to consult current docs (context7 / node_modules docs) instead of trusting training data."* Everything here is passed through to the output verbatim and marked non-substitutable.
- **05 Constraints & non-goals** — what the AI must NOT do (no auth, no tests, don't touch X…).
- **AI extras** — 2–4 idea-specific questions from the engine, appended as `06+`. If the engine returns garbage (small models sometimes do), extras are silently dropped and the skeleton alone proceeds.

### 3.3 Output
The enhanced prompt streams into a mono-type block (streaming matters at 5–15 tok/s — it feels alive instead of hung). Actions: **Copy** (primary), Regenerate, **"Escalate to Claude"** (re-runs the same inputs on the Claude engine — the natural moment to want it, right after seeing a mediocre local result), Save to history.

### 3.4 Profile panel
An editable markdown document, seeded at first deploy (section 5.3). This is the "fits me, not generalized" mechanism: the enhancement prompt injects it wholesale. Editing it changes every future enhancement. Below it, a quiet history list.

---

## 4. The prompts (core IP)

Both live in `lib/prompts.ts` as exported template functions so they're versioned in git and easy to iterate on.

### 4.1 Question-generation prompt (draft)

```
You generate clarifying questions for a prompt-enhancement tool.

You will receive a raw project idea. The user will already answer fixed
questions about: goal/outcome, scope/size, design direction, tech stack
and versions, constraints/non-goals. Do NOT repeat those topics.

Return 2-4 questions that target genuinely load-bearing ambiguities
SPECIFIC to this idea — decisions that would change what gets built.
Skip anything cosmetic or answerable by a sensible default.

Return ONLY a JSON array: [{"q": "...", "hint": "..."}]
"hint" is an optional one-line example answer. No prose outside JSON.

RAW IDEA:
{{idea}}
```

### 4.2 Enhancement prompt (draft)

Encodes the documented Anthropic prompt-improver techniques: structure via XML-ish sections, concrete specifics over vague adjectives, explicit non-invention rules.

```
You rewrite raw project ideas into precise, personal prompts for an AI
coding agent (usually Claude Code). You are a prompt engineer, not a
builder — output the prompt and nothing else.

RULES
- Preserve the user's intent exactly. Never add features, scope, or
  tech the user did not ask for.
- Concrete beats vague: replace adjectives like "nice" or "modern" with
  the specific choices found in the profile and answers.
- The tech section is law: reproduce pinned versions verbatim, forbid
  substitutions, and include the instruction to consult current docs
  when the user enabled it.
- Unanswered questions go into <open_decisions> as explicit choices for
  the builder to raise — never silently decide them yourself.
- Write in second person, addressed to the builder AI.
- Output ONLY the enhanced prompt in this structure:

<context>       what this is, who it's for, why it exists
<task>          what to build, precisely scoped
<design_language>  from the profile + answers (palette, type, shape, density, voice)
<tech_constraints> pinned stack, versions, doc-consultation instruction, forbidden substitutions
<working_agreements> honesty rules, scope discipline, verification habits from the profile
<open_decisions>   unanswered questions, stated as decisions to surface
<verification>     how the builder should prove it works

INPUTS
[profile]   {{profile}}
[raw idea]  {{idea}}
[answers]   {{answers}}
```

### 4.3 Profile seed (from what I know of your taste — review before shipping)

```markdown
# Design
- Warm paper canvas (#FAF9F5 family), never pure white, never dark-by-default.
- ONE accent color used consistently; soft pastel spots are decorative only,
  never carrying meaning.
- Serif display headlines (Lora-class) + clean sans body + mono for numbers
  and code. Emphasis = italic same-serif, never color-only.
- Sharp corners (2-4px radius), hairline borders instead of shadows,
  airy spacing, asymmetric layouts over 50/50.
- Minimalistic premium feel; density low; no decoration without a job.

# Copy voice
- Plain, concrete, a little confident. Banned: hype verbs (unleash,
  elevate, revolutionize), fake precision, claims about unbuilt things
  in present tense. Every number real or cut.

# Implementation
- Next.js (App Router) + Tailwind v4 tokens + TypeScript by default.
- Design tokens namespaced and additive; plan-first workflow with phases;
  verify in a real browser before calling anything done.
- For any new/fast-moving tech: consult current docs (context7,
  node_modules docs) — do not trust training-data API shapes.

# Process
- Honest status reporting; failing tests reported as failing.
- Prefer small verifiable phases over big-bang delivery.
```

---

## 5. Design

Base reference: the sathustle landing design system (`sathustle/docs/plans/2026-07-13-landing-redesign.md`), per the user's standing preference — reused unless overridden later.

**Carried over as-is:** paper `#FAF9F5` / paper-2 / hairline / ink / ink-muted tokens; Lora serif display + Geist Sans + Geist Mono (`tabular-nums`); radius rule (2px inputs/buttons, 4px cards, no pills); hairlines-over-shadows; `max-w` container with generous vertical rhythm; spots as decorative blurred radials, `pointer-events-none`.

**Different for zhaksartu:**
- **Accent: deep evergreen `#0E4B3B`** (proposed — gives zhaksartu its own identity vs SATHustle's navy; passes AA on paper; veto → keep navy `#001A55`). Open item 4.
- **Layout: one narrow column** (`max-w-2xl`-ish), tool not landing. Nav is a single hairline row: `zhaksartu` wordmark in Lora lowercase, tiny `жақсарту` gloss in ink-muted, engine chip, profile link. Footer: nothing but a hairline and a one-liner.
- **The output block** is the one "moment": ivory panel, mono type, single ambient accent-tinted shadow (the only shadow on the page), copy button pinned top-right.
- **Motion: minimal.** Streaming text is the animation. Plus a subtle pulsing chip during "waking the model…" cold starts. `prefers-reduced-motion` respected.

---

## 6. Cost picture (honest)

| Item | Cost |
|---|---|
| Railway Hobby plan | $5/mo (includes $5 usage) |
| `web` service | negligible (~256MB RAM, mostly idle) |
| `ollama` service, always-on | ~$40–60/mo at 4–6GB RAM — **too much; don't do this** |
| `ollama` with app sleeping, personal use | a few $/mo (pay for active minutes only) |
| Claude escalation, `claude-opus-4-8` | ~$0.03–0.06 per enhancement (~2K in / 1.5K out) |
| Claude escalation, `claude-haiku-4-5` | <$0.01 per enhancement |

Truth worth stating: at personal usage volume, the Claude API path is *cheaper* than hosting the local model. Local-first is a privacy/flat-cost/ownership choice, not a savings choice — accepted knowingly.

---

## 7. Implementation phases

### Phase 0 — Scaffold
1. `git init`, Next.js 16 + Tailwind v4 + TypeScript scaffold.
2. Tokens in `globals.css` `@theme` (paper system + evergreen accent), fonts via `next/font`.
3. Passcode middleware + gate screen.

### Phase 1 — Engine layer
4. `EnhanceEngine` interface; `OllamaEngine` + `ClaudeEngine`; `/api/health`.
5. Railway project: `ollama` service + volume, pull Qwen3.5-4B-Q4_K_M, private networking to `web`, app sleeping on.
6. SSE streaming end to end; cold-start "waking" state.
7. **A/B on real prompts:** Qwen3.5 4B vs Phi-4-mini on 3–4 of the user's actual raw ideas; keep the better writer.

### Phase 2 — The flow
8. Idea screen → `/api/questions` (skeleton + AI extras, garbage-tolerant) → questions form → `/api/enhance` streamed output with Copy / Regenerate / Escalate.

### Phase 3 — Profile & history
9. SQLite on volume; profile editor seeded with section 4.3; save/list history.

### Phase 4 — Polish & verify
10. Spots, mobile pass, reduced-motion audit, both auth states of the gate.
11. Full journey test on the deployed URL: cold start → passcode → idea → questions → local enhancement → escalate to Claude → copy. Run `verify` before calling each phase done.

---

## 8. Open items — ALL RESOLVED (2026-07-16)

1. **Railway plan:** Hobby. ✓
2. **Domain:** `zhaksartu.xyz` (already owned, DNS managed on Vercel). ✓
3. **UI language:** English (wordmark + gloss keep the Kazakh identity). ✓
4. **Accent:** keep sathustle navy `#001A55`. ✓ (Evergreen proposal declined.)
5. **Anthropic key:** provided; lives ONLY in `.env.local` (gitignored) and Railway env vars — never in the repo. User advised to rotate it after setup since it passed through chat.
6. **Cold starts:** accepted; app sleeping ON. UI shows a "waking the local model" state.
7. **Profile seed:** approved as drafted.
8. **History:** keep, cleanly — auto-saved per enhancement, capped at 200, minimal list UI with copy/delete.
9. **Future modes:** shown in the UI as visible-but-disabled ghost chips (`write` / `image` / `general`) so they aren't forgotten and cost nothing until built.

## 9. Post-plan additions (2026-07-16)

- **Repo is public** at `github.com/tairqaldy/zhaksartu` by explicit decision; README leads with the what/why (token savings on plan writing + research, privacy for sensitive ideas, "free\*" quality post-coldstart). Railway deploys from this repo.
- **Storage simplification:** plain JSON/markdown files on the volume instead of SQLite — zero native deps, identical behavior at single-user scale.
- **Next 16 reality check:** `middleware.ts` is deprecated in Next 16 → the auth gate lives in `proxy.ts` (verified against `node_modules/next/dist/docs`).
- **Model tag verified:** `qwen3.5:4b` exists on ollama.com; it is a thinking model → requests send `think: false` and the stream strips `<think>` spans defensively.
- **Phase-1 A/B (Qwen vs Phi-4-mini) deferred to prod:** the user won't run models locally, so the comparison happens on Railway after deploy by swapping `OLLAMA_MODEL`.

## 10. Architecture pivot: local demoted, Claude tiers primary (2026-07-16, night)

Prod testing surfaced two compounding, structural problems with local CPU
inference on Railway — not code bugs, a hardware/platform mismatch:

1. **`mmap = false` on Railway volumes.** Every wake from App Sleeping forces
   a full model re-read off disk plus CPU weight repacking — a multi-minute
   cold start, not the ~30s originally assumed. Mitigated (not solved) with
   `/api/warm` (own secret, `WARM_SECRET`) and a scheduled GitHub Action
   (`.github/workflows/keep-warm.yml`) that keeps it resident during work
   hours.
2. **Single-digit-seconds-per-token generation**, even once warm. Confirmed
   live: a real enhancement completed but took minutes, and a second attempt
   hit a Railway edge-proxy 502 (`Application failed to respond`) — the
   platform's own idle-connection timeout firing on a token gap, independent
   of any timeout in our code.

Decision: **Claude becomes the primary and default engine**, exposed as four
selectable tiers (`lib/engines.ts` → `CLAUDE_TIERS`): Haiku 4.5 (fast/cheap),
Sonnet 5 (default), Opus 4.8 (best quality), Fable 5 (top-tier, priciest —
wired with the recommended server-side refusal fallback to Opus 4.8 per the
Claude API skill). Local stays deployed and selectable, relabeled
"experimental, slow" in the UI, rather than removed — the infra is already
paid for and it may be useful later (smaller model, or a real GPU host).

`CLAUDE_MODEL` env var removed — tiers are fixed in code, not configured
per-deploy, so there's one source of truth for what "sonnet" or "opus" means
in this app.
