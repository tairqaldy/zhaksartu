# zhaksartu

*жақсарту — "to improve" (Kazakh).*

A self-hosted, cloud-deployed personal tool with three modes: **build**, a
raw-idea-to-precise-prompt enhancer; **roast**, a conversational stress-test
for a plan before you build it; and **market**, a go-to-market strategy
conversation.

## Why this exists

1. **Save tokens on plan writing and research.** The expensive part of working with AI builders is re-explaining your taste, stack, and standards every time. Here that lives in an editable profile that gets injected into every mode.
2. **No idea is good until it's been stress-tested.** Roast mode is a genuine back-and-forth conversation whose whole job is to find what breaks — unvalidated assumptions, skipped edge cases, scope creep, timelines that assume a miracle — before any of it costs real build time.
3. **Marketing is a real skill, not an afterthought.** Market mode is a strict, expert-toned conversation grounded in real frameworks — Rory Sutherland's psycho-logic (framing, signaling, and narrative as real functional value, not decoration) plus startup distribution canon (positioning, wedge strategy, "sell the aspirin not the vitamin") — not another AI-generated listicle of generic tips.
4. **A model for the moment.** Four Claude tiers (Haiku 4.5 → Sonnet 5 → Opus 4.8 → Fable 5) are one click apart — cheap and fast for a quick pass, top-tier when the idea deserves it. Cost per turn ranges from a fraction of a cent to a few cents.

Deliberate features born from real pain:

- **A separated tech-stack section** in every build-mode enhancement: pinned versions, package manager, hosting — passed through verbatim and marked non-substitutable, plus an instruction telling the builder AI to consult *current* docs instead of its training data. AIs love quietly downgrading your stack; this stops it.
- **Skipped questions become open decisions**, never invented answers. The output prompt explicitly lists what wasn't decided.
- **Roast mode roasts the plan, never the person.** It's built to find real weaknesses and be funny about it, with concrete follow-ups every turn — not a wall of hedged, generic caution, and not manufactured criticism when a part of the plan is actually fine.
- **Both chat modes catch self-contradiction.** Roast and market are told to check what you're proposing against your own stated standards in the profile — "you wrote that you always do X, and step 3 here does the opposite" is exactly the kind of thing a good outside reviewer catches.

## How it works

**Build mode**
```
raw idea ──► fixed questions (goal / scope / design / tech / constraints)
             + 2–4 AI-generated idea-specific questions
                  ──► enhanced prompt (streamed), structured as:
                      <context> <task> <design_language> <tech_constraints>
                      <working_agreements> <open_decisions> <verification>
```

**Roast / market mode** (same underlying chat architecture, different persona)
```
paste a plan/product ──► AI responds in character (roast: blunt/funny/
                          stress-testing; market: strict/expert/strategic)
                          ──► you respond, it presses on unresolved points
                              or builds on what you add
                              ──► keeps going until you're done, autosaved
                                  to history after every turn
```

- **Engine:** Claude API, four selectable tiers (haiku/sonnet/opus/fable) — same picker, every mode.
- **Profile:** one editable markdown document (design language, copy voice, implementation defaults, standards) injected into every mode.
- **Auth:** a single passcode → signed cookie. This is a single-user tool.
- **Storage:** profile + history as plain files on a Railway volume. No database.
- **Chat UI:** bounded, internally-scrollable panel that auto-scrolls to the newest message as it streams — the page itself doesn't grow forever as a conversation gets long.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Anthropic SDK.

## Deploy (Railway, one service)

1. New service → GitHub repo `tairqaldy/zhaksartu` (this repo). Railway detects Next.js.
2. Attach a small **volume** mounted at `/data`.
3. Env vars (see `.env.example`):
   - `PASSCODE` — required; the gate.
   - `ANTHROPIC_API_KEY` — required; enables every tier. **Set it here, never in the repo.**
   - `DATA_DIR=/data`
4. Generate a public domain, then add the custom domain.

**Domain (`zhaksartu.xyz`, DNS on Vercel)**
- Railway: service → Settings → Networking → Custom Domain → `zhaksartu.xyz` → copy the target Railway shows.
- Vercel dashboard → Domains → `zhaksartu.xyz` → DNS records → add an **ALIAS** record (not CNAME — Vercel rejects CNAME at the apex) with **Name `@`**, **Value** the Railway target.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in PASSCODE and ANTHROPIC_API_KEY
npm run dev
```

Without `ANTHROPIC_API_KEY` the app has no working engine. Without `PASSCODE`, the gate is open — dev convenience only.

## Security notes

- No secrets in this repo. `.env*` and `/data` are gitignored; keys live in Railway env vars.
- The app sets `noindex` and sits behind the passcode; the *code* is public, the *tool* is private.

## Planned modes

`storytelling` is visible in the UI as a disabled chip — a reserved slot, not
vaporware pretending to work. The concept: a conversation that helps a
product, brand, or idea *feel alive* — origin story, narrative arc, the
characters (maker, user, the problem itself), voice — because people attach
to stories, not feature lists. Not built yet; it costs nothing until it is.

## History

An earlier version also ran a local open model (Qwen3.5 4B via Ollama) as a
privacy-first engine. CPU-only inference on Railway turned out too slow for
real use (multi-second-per-token, plus a `mmap`-unsupported cold-load
penalty that could run several minutes) — see the git history around
2026-07-16/17 if you want the full postmortem. Removed rather than kept as
dead weight; Claude is fast, cheap enough, and simply better for this.
