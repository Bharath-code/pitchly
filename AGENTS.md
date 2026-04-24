# Pitchly — Agent Notes

Two-package repo: Chrome Extension (MV3) + Cloudflare Worker (Durable Object / Agents SDK).

## Quick Commands

```bash
# Root convenience scripts
npm run build:ext       # extension → node build.mjs
npm run dev:worker      # worker → wrangler dev
npm run deploy:worker   # worker → wrangler deploy

# Extension (cd extension)
npm run build           # node build.mjs
npm run watch           # node build.mjs --watch

# Worker (cd worker)
npm run dev             # wrangler dev
npm run deploy          # wrangler deploy
npm run type-check      # tsc --noEmit
```

## Monorepo Boundaries

- `extension/` — Chrome MV3 extension. Built with esbuild (`build.mjs`), outputs to `extension/dist/`.
- `worker/` — Cloudflare Worker using `agents` SDK + Durable Object `CallSessionAgent`. Entry: `src/index.ts`.

No tests, no lint, no CI, no formatter config in this repo.

## Extension Build Quirks

- **Do not use `tsc` to build.** The real build is `node build.mjs`.
- Four entry points: `background.ts`, `content.ts`, `popup.ts`, `audio-processor.ts`.
- `audio-processor.ts` is special:
  - Excluded in `tsconfig.json` (`exclude: ["src/audio-processor.ts"]`)
  - Built as **IIFE** (not ESM) because AudioWorklet `addModule()` cannot handle bundled ESM imports.
  - Loaded at runtime via `chrome.runtime.getURL('dist/audio-processor.js')`.
- `build.mjs` copies static assets into `dist/`.
- **Chrome load folder:** Load `extension/dist/` in Chrome (not `extension/`). The built `manifest.json` inside `dist/` references files relative to that folder.

## Worker Dev & Secrets

- Local dev needs `worker/.dev.vars` (gitignored):
  ```
  GOOGLE_GENERATIVE_AI_API_KEY=AIza...
  ```
- Production secrets: `npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY`
- Optional: `npx wrangler secret put RESEND_API_KEY` (for post-call emails)
- Model is set in `wrangler.toml` (`AI_MODEL`). Current: `gemini-3-flash-preview`. Swapping providers only requires changing that var + adding the matching secret.

## Extension → Worker Connection

- `extension/src/popup.ts` reads `workerHost` from `chrome.storage.local`. Default: `pitchly-worker.kumarbharath63.workers.dev`
- WebSocket path: `/agents/call-session-agent/:sessionName` (routed by `routeAgentRequest()` from `agents` SDK).
- Settings (email, manager email, webhook) are sent via `session_settings` WS message immediately after connection, and redundantly in `call_ended`.

## Audio Pipeline Summary

1. `background.ts` captures tab + mic (three-tier fallback), passes tab stream ID to content script.
2. `content.ts` sets up AudioContext, loads AudioWorkletProcessor.
3. Dual-stream architecture:
   - **Tab audio** → AudioWorklet → WS `audio_chunk` → Deepgram Nova-3 (STT)
   - **Mic audio** → separate AudioWorklet node → local RMS accumulation → WS `talk_ratio` every 5s
   - In mic-only fallback, mic audio is sent to Deepgram instead
4. PCM floats sent over WS to `CallSessionAgent`.
5. Worker: Deepgram Nova-3 (STT) → Flux smart-turn-v2 (end-of-turn) → Gemini (objection classify + stream response).

## Real-Time HUD Architecture

During a call, a persistent `sc-call-meta` header stays visible:
- **Talk ratio bar**: Green (balanced), Yellow (you >60%), Red (you >75%)
- **Sentiment dot**: 🟢 Strong | 🟡 Cooling | 🔴 At Risk
- **Nudge text**: Contextual coaching ("Listen more!", "Acknowledge their concern")

Objection cards render in `sc-objection-area` (sub-area) that can be dismissed independently while call meta stays.

**Post-call**: `sc-snapshot` panel replaces call meta with:
- Duration, talk ratio, final sentiment stats
- Objections list with type badges
- Call summary
- Follow-up draft with **Copy** button
- Persistence status indicator

## Sentiment System

**Tier 1 (Real-time)**: Keyword-based EMA with word-boundary regex matching (prevents "no" matching "know") and time-decay (halves to neutral after 10s silence). Thresholds: ≥0.3 = strong, ≤-0.3 = at_risk.

**Tier 2 (Post-call)**: Full transcript sent to Gemini for phase-based sentiment arc analysis with evidence-based shift detection.

## Post-Call Pipeline

Trigger: Extension sends `call_ended` → Worker:
1. Calculates avg talk ratio from accumulated samples
2. Builds formatted transcript from in-memory segments
3. Runs Gemini post-call analysis (`PostCallAnalysisSchema`)
4. Persists to D1 (`calls`, `transcript_segments`, `objections` tables)
5. Sends `snapshot_preview` to extension HUD
6. Fires webhook POST (if configured)
7. Sends Resend email (if `RESEND_API_KEY` + rep email configured)

## D1 Database

- Database: `pitchly-db` (APAC region)
- Tables: `calls`, `transcript_segments`, `objections`
- Schema: `worker/schema.sql`
- All queries parameterized — zero SQL injection risk

## Security Notes

- **SQL Injection**: 100% parameterized D1 queries via `.prepare().bind()`
- **XSS (Email)**: `escapeHtml()` sanitizes all user-influenced content in Resend HTML templates
- **Email Validation**: `isValidEmail()` regex guard before sending to Resend
- **Webhook SSRF**: URL must start with `http(s)://`, max 2048 chars
- **CORS**: `*` origin (tighten to `chrome-extension://` post-MVP)
- **Type Safety**: `exactOptionalPropertyTypes: true` enforced in both packages

## Style & Conventions

- Strict TypeScript in both packages (`strict: true`, `noUnusedLocals`, `exactOptionalPropertyTypes`).
- Extension target: `chrome112`, ESM.
- Worker target: `ES2022`, no DOM lib.
- No tests exist; verify manually by loading the extension and running the worker locally.
- See `TEST_SCENARIOS.md` for structured test scripts.

## File Map

```
salesCoach/
├── extension/
│   ├── src/
│   │   ├── content.ts        # WebSocket lifecycle, audio streaming, message routing
│   │   ├── hud.ts            # DOM HUD: call-meta, sentiment, objection cards, snapshot
│   │   ├── types.ts          # Shared TS types: messages, settings, snapshots
│   │   ├── popup.ts          # Extension popup UI with settings
│   │   ├── background.ts     # MV3 service worker, tabCapture, keepalive alarm
│   │   ├── audio-processor.ts # AudioWorkletProcessor (IIFE, separate build)
│   │   └── hud.css           # External stylesheet (fallback)
│   ├── popup.html            # Popup markup
│   ├── popup.css             # Popup styles
│   ├── manifest.json         # MV3 manifest
│   └── build.mjs             # esbuild script
├── worker/
│   ├── src/
│   │   ├── index.ts          # CallSessionAgent DO: STT, classification, sentiment, persistence
│   │   ├── schema.ts         # Zod schemas: ObjectionSchema, PostCallAnalysisSchema
│   │   └── prompts.ts        # Upgraded prompts with chain-of-thought + few-shot examples
│   ├── wrangler.toml         # Worker config: D1, DO, AI binding, model var
│   └── schema.sql            # D1 database schema
├── PRD-phase2.md             # Phase 2 spec
├── TEST_SCENARIOS.md         # 6 benchmark sales scripts + stress tests
├── implementation-plan.md    # Original MVP plan
├── REMAINING_TASKS.md        # Deferred features tracker
└── AGENTS.md                 # This file
```
