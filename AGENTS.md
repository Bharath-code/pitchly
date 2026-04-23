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
- Model is set in `wrangler.toml` (`AI_MODEL`). Swapping providers only requires changing that var + adding the matching secret (e.g. `ANTHROPIC_API_KEY`).

## Extension → Worker Connection

- `extension/src/content.ts` hardcodes `WORKER_HOST`. Change it to `localhost:8787` for local dev, or to your deployed worker domain for prod.
- WebSocket path: `/agents/call-session-agent/:sessionName` (routed by `routeAgentRequest()` from `agents` SDK).

## Audio Pipeline Summary

1. `background.ts` captures tab + mic (three-tier fallback), mixes to 16kHz mono stream.
2. `content.ts` gets the mic stream, pumps it through `AudioWorkletProcessor` in 4096-sample chunks.
3. PCM floats sent over WS to `CallSessionAgent`.
4. Worker: Deepgram Nova-3 (STT) → Flux smart-turn-v2 (end-of-turn) → Gemini (objection classify + stream response).

## Style & Conventions

- Strict TypeScript in both packages (`strict: true`, `noUnusedLocals`, `exactOptionalPropertyTypes`).
- Extension target: `chrome112`, ESM.
- Worker target: `ES2022`, no DOM lib.
- No tests exist; verify manually by loading the extension and running the worker locally.
