# zhaksartu

*жақсарту — "to improve" (Kazakh).*

A self-hosted, cloud-deployed, personal prompt enhancer. You paste a raw, messy project idea; it asks you a few sharp questions (a fixed skeleton plus AI-generated extras); it returns a precise prompt tailored to *your* stored preferences — ready to paste into Claude Code or any AI builder.

## Why this exists

1. **Save tokens on plan writing and research.** The expensive part of working with AI builders is re-explaining your taste, stack, and standards every time. Here that lives in an editable profile that gets injected into every enhancement.
2. **Privacy when it matters.** The default engine is a small open model (Qwen3.5 4B) running on my own Railway service — sensitive ideas never leave infrastructure I control. A per-request "Escalate to Claude" button exists for when quality beats privacy.
3. **High-quality prompts for "free\*".** \*Free after the server bill; the model service sleeps when idle, so it costs active minutes only — the price is a ~30–60s cold start on the first request.

Two deliberate features born from real pain:

- **A separated tech-stack section** in every enhancement: pinned versions, package manager, hosting — passed through verbatim and marked non-substitutable, plus an instruction telling the builder AI to consult *current* docs instead of its training data. AIs love quietly downgrading your stack; this stops it.
- **Skipped questions become open decisions**, never invented answers. The output prompt explicitly lists what wasn't decided.

## How it works

```
raw idea ──► fixed questions (goal / scope / design / tech / constraints)
             + 2–4 AI-generated idea-specific questions
                  ──► enhanced prompt (streamed), structured as:
                      <context> <task> <design_language> <tech_constraints>
                      <working_agreements> <open_decisions> <verification>
```

- **Engines:** `local` (Ollama + Qwen3.5 4B, CPU, private networking) by default; `claude` (Anthropic API) as an optional escalation.
- **Profile:** one editable markdown document (design language, copy voice, implementation defaults) injected into every enhancement.
- **Auth:** a single passcode → signed cookie. This is a single-user tool.
- **Storage:** profile + history as plain files on a Railway volume. No database.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Ollama · Anthropic SDK.

## Deploy (Railway, two services)

This repo is the deploy source. In a Railway project:

**1. `ollama` service**
- New service → Docker image `ollama/ollama`.
- Attach a **volume** mounted at `/root/.ollama` (so the model survives redeploys).
- Env: `OLLAMA_KEEP_ALIVE=30m`.
- Enable **App Sleeping** (Settings → Serverless) — this is what makes it cheap.
- Do **not** expose it publicly. After first deploy, pull the model once
  (service shell): `ollama pull qwen3.5:4b`.

**2. `web` service**
- New service → GitHub repo `tairqaldy/zhaksartu` (this repo). Railway detects Next.js.
- Attach a small **volume** mounted at `/data`.
- Env vars (see `.env.example`):
  - `PASSCODE` — required; the gate.
  - `OLLAMA_URL=http://ollama.railway.internal:11434`
  - `OLLAMA_MODEL=qwen3.5:4b`
  - `DATA_DIR=/data`
  - `ANTHROPIC_API_KEY` — optional; enables the Claude engine. **Set it here, never in the repo.**
  - `CLAUDE_MODEL=claude-opus-4-8` (or `claude-haiku-4-5` for pennies).
- Generate a public domain, then add the custom domain.

**3. Domain (`zhaksartu.xyz`, DNS on Vercel)**
- Railway: `web` service → Settings → Networking → Custom Domain → `zhaksartu.xyz` → copy the CNAME target Railway shows.
- Vercel dashboard → Domains → `zhaksartu.xyz` → DNS records → add `CNAME @ <railway-target>` (Vercel DNS flattens apex CNAMEs) — or use `www` and redirect the apex.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in PASSCODE (and ANTHROPIC_API_KEY if you have one)
npm run dev
```

Without a local Ollama, the `local` engine is down (the UI shows it); the `claude` engine works if a key is set. Without `PASSCODE`, the gate is open — dev convenience only.

## Security notes

- No secrets in this repo. `.env*` and `/data` are gitignored; keys live in Railway env vars.
- The app sets `noindex` and sits behind the passcode; the *code* is public, the *tool* is private.
