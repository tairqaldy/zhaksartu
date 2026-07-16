# zhaksartu

*жақсарту — "to improve" (Kazakh).*

A self-hosted, cloud-deployed, personal prompt enhancer. You paste a raw, messy project idea; it asks you a few sharp questions (a fixed skeleton plus AI-generated extras); it returns a precise prompt tailored to *your* stored preferences — ready to paste into Claude Code or any AI builder.

## Why this exists

1. **Save tokens on plan writing and research.** The expensive part of working with AI builders is re-explaining your taste, stack, and standards every time. Here that lives in an editable profile that gets injected into every enhancement.
2. **A model for the moment.** Four Claude tiers (Haiku 4.5 → Sonnet 5 → Opus 4.8 → Fable 5) are one click apart — cheap and fast for a quick pass, top-tier when the idea deserves it. Cost per enhancement ranges from a fraction of a cent to a few cents.
3. **A private, self-hosted option exists too.** A small open model (Qwen3.5 4B) runs on my own Railway service, sleeping when idle. It's there for when privacy beats speed — currently labeled "experimental" because CPU-only inference on Railway (see below) is slow enough that Claude is the practical default.

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

- **Engines:** `claude` (Anthropic API, four selectable tiers) by default; `local` (Ollama + Qwen3.5 4B, CPU, private networking) as an experimental, clearly-labeled option — see "Local model reality check" below.
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
  - `ANTHROPIC_API_KEY` — required to enable the Claude tiers (haiku/sonnet/opus/fable), which are the primary engine. **Set it here, never in the repo.**
  - `WARM_SECRET` — optional; enables `/api/warm` for the local model (see below). Any random string.
- Generate a public domain, then add the custom domain.

**3. Domain (`zhaksartu.xyz`, DNS on Vercel)**
- Railway: `web` service → Settings → Networking → Custom Domain → `zhaksartu.xyz` → copy the CNAME target Railway shows.
- Vercel dashboard → Domains → `zhaksartu.xyz` → DNS records → add an **ALIAS** record (not CNAME — Vercel rejects CNAME at the apex) with **Name `@`**, **Value** the Railway target.

## Local model reality check

The local engine is real and deployed, but in practice CPU-only inference
on Railway's shared compute is too slow for interactive use — single-digit
seconds *per token*, not per response. Two compounding problems:

1. **Railway volumes don't support `mmap`**, so every time the `ollama`
   service wakes from App Sleeping it has to read the whole model off disk
   and repack weights for CPU — a multi-minute cold start, not the ~30s
   originally assumed.
2. **Railway's own edge proxy times out a connection that goes too long
   without a byte.** A slow-enough token gap gets the request killed with a
   502 (`Application failed to respond`) before it ever reaches the app's
   own (already generous) timeouts.

Claude is the default and recommended engine for exactly this reason. Local
stays available, clearly labeled "experimental, slow" in the UI, for anyone
who wants to try it or extend it later (a smaller model, a different host
with real GPU access, etc.).

### Keeping the local model warm (if you use it anyway)

Two ways to reduce the cold-start pain:

- **Wake it by hand, anytime:** `curl -H "x-warm-secret: $WARM_SECRET" https://zhaksartu.xyz/api/warm`
  Returns once the model is resident (`alreadyLoaded: true` if it already was — near-instant).
- **Keep it warm automatically during work hours:** `.github/workflows/keep-warm.yml`
  pings that endpoint every 5 minutes on a schedule, which keeps Railway's
  idle timer from ever firing in that window — outside it, the service
  sleeps normally. To enable it:
  1. Repo → Settings → Secrets and variables → Actions → **New repository secret** → `WARM_SECRET` → same value as on Railway.
  2. Same page → **Variables** tab → **New repository variable** → `APP_URL` → `https://zhaksartu.xyz`.
  3. The cron in the workflow assumes UTC+2; edit the two hour numbers in `.github/workflows/keep-warm.yml` if your timezone differs.

This doesn't make cold starts free — it just confines the expensive one to
the first ping of the morning instead of your first real request.

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
